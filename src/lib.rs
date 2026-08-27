use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Days, Utc};
use rand::{distr::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{Row, SqlitePool};
use tokio::sync::Mutex;
use tower_http::{
    limit::RequestBodyLimitLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    attempts: Arc<Mutex<HashMap<String, (Instant, u32)>>>,
}

impl AppState {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            pool,
            attempts: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

pub fn app(state: AppState, frontend: PathBuf) -> Router {
    let index = frontend.join("index.html");
    let share_routes = Router::new()
        .route("/api/shares", post(create_share))
        .route("/api/shares/{id}", get(get_share).delete(delete_share))
        .route("/api/shares/{id}/status", get(share_status))
        .layer(DefaultBodyLimit::max(128 * 1024))
        .layer(RequestBodyLimitLayer::new(128 * 1024));

    Router::new()
        .route("/health", get(health))
        .merge(share_routes)
        .fallback_service(ServeDir::new(frontend).not_found_service(ServeFile::new(index)))
        .layer(middleware::from_fn(security_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Attachment {
    r#type: String,
    value: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PublicMoment {
    id: String,
    at: String,
    kind: String,
    outcome: String,
    note: String,
    attachment: Option<Attachment>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PracticeTask {
    id: String,
    text: String,
    done: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CreateShare {
    student_name: String,
    session_title: String,
    session_date: String,
    summary: String,
    moments: Vec<PublicMoment>,
    next_tasks: Vec<PracticeTask>,
    consent: bool,
    expires_days: u64,
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    error: String,
}

fn error(status: StatusCode, message: impl Into<String>) -> (StatusCode, Json<ErrorBody>) {
    (
        status,
        Json(ErrorBody {
            error: message.into(),
        }),
    )
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "build": option_env!("BUILD_SHA").unwrap_or("dev") }))
}

async fn create_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateShare>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> {
    rate_limit(&state, &headers).await?;
    validate(&payload)?;

    let now = Utc::now();
    let expires = now
        .checked_add_days(Days::new(payload.expires_days))
        .ok_or_else(|| error(StatusCode::BAD_REQUEST, "Choose a valid expiry."))?;
    let id = random_token(22);
    let delete_key = random_token(42);
    let content = json!({
        "student_name": payload.student_name.trim(),
        "session_title": payload.session_title.trim(),
        "session_date": payload.session_date,
        "summary": payload.summary.trim(),
        "moments": payload.moments,
        "next_tasks": payload.next_tasks,
    });
    sqlx::query("INSERT INTO shares (id, delete_key, content, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&id).bind(&delete_key).bind(content.to_string()).bind(now.to_rfc3339()).bind(expires.to_rfc3339())
        .execute(&state.pool).await
        .map_err(|_| error(StatusCode::INTERNAL_SERVER_ERROR, "The link could not be saved. Try again."))?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": id, "delete_key": delete_key, "expires_at": expires.to_rfc3339() })),
    ))
}

async fn get_share(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    if !valid_token(&id, 22) {
        return Err(error(
            StatusCode::NOT_FOUND,
            "This recap could not be found.",
        ));
    }
    let row = sqlx::query("SELECT content, expires_at FROM shares WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| {
            error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "The recap could not be opened.",
            )
        })?
        .ok_or_else(|| error(StatusCode::NOT_FOUND, "This recap could not be found."))?;
    let expires_at: String = row.get("expires_at");
    let expires = DateTime::parse_from_rfc3339(&expires_at).map_err(|_| {
        error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "The recap expiry is invalid.",
        )
    })?;
    if expires < Utc::now() {
        let _ = sqlx::query("DELETE FROM shares WHERE id = ?")
            .bind(&id)
            .execute(&state.pool)
            .await;
        return Err(error(StatusCode::GONE, "This recap has expired."));
    }
    sqlx::query("UPDATE shares SET open_count = open_count + 1 WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|_| {
            error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "The recap could not record its open.",
            )
        })?;
    let content: String = row.get("content");
    let mut value: Value = serde_json::from_str(&content).map_err(|_| {
        error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "The recap content is invalid.",
        )
    })?;
    value["expires_at"] = Value::String(expires_at);
    Ok(Json(value))
}

#[derive(Deserialize)]
struct KeyQuery {
    key: String,
}

async fn share_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<KeyQuery>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    let row = sqlx::query("SELECT delete_key, open_count, expires_at FROM shares WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| error(StatusCode::INTERNAL_SERVER_ERROR, "Status is unavailable."))?
        .ok_or_else(|| error(StatusCode::NOT_FOUND, "This recap could not be found."))?;
    let expected: String = row.get("delete_key");
    if !constant_time_equal(query.key.as_bytes(), expected.as_bytes()) {
        return Err(error(
            StatusCode::FORBIDDEN,
            "The management key is not valid.",
        ));
    }
    Ok(Json(
        json!({ "opens": row.get::<i64, _>("open_count"), "expires_at": row.get::<String, _>("expires_at") }),
    ))
}

async fn delete_share(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<KeyQuery>,
) -> Result<StatusCode, (StatusCode, Json<ErrorBody>)> {
    let result = sqlx::query("DELETE FROM shares WHERE id = ? AND delete_key = ?")
        .bind(&id)
        .bind(&query.key)
        .execute(&state.pool)
        .await
        .map_err(|_| {
            error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "The shared copy could not be deleted.",
            )
        })?;
    if result.rows_affected() == 0 {
        return Err(error(
            StatusCode::NOT_FOUND,
            "The shared copy or management key was not found.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

fn validate(payload: &CreateShare) -> Result<(), (StatusCode, Json<ErrorBody>)> {
    if !payload.consent {
        return Err(error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Record the student's consent before sharing.",
        ));
    }
    if payload.expires_days == 0 || payload.expires_days > 30 {
        return Err(error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Link expiry must be between 1 and 30 days.",
        ));
    }
    if payload.student_name.trim().is_empty() || payload.student_name.chars().count() > 80 {
        return Err(error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Student name must be 1–80 characters.",
        ));
    }
    if payload.session_title.trim().is_empty() || payload.session_title.chars().count() > 120 {
        return Err(error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Session topic must be 1–120 characters.",
        ));
    }
    if payload.summary.chars().count() > 2_000
        || payload.moments.len() > 200
        || payload.next_tasks.len() > 50
    {
        return Err(error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "The recap contains too much content.",
        ));
    }
    if chrono::NaiveDate::parse_from_str(&payload.session_date, "%Y-%m-%d").is_err() {
        return Err(error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Session date must be YYYY-MM-DD.",
        ));
    }
    for moment in &payload.moments {
        if moment.note.trim().is_empty()
            || moment.note.chars().count() > 2_000
            || !["attempt", "breakthrough", "handoff"].contains(&moment.kind.as_str())
            || !["progressing", "stuck", "solved"].contains(&moment.outcome.as_str())
            || DateTime::parse_from_rfc3339(&moment.at).is_err()
        {
            return Err(error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "A lesson moment is not valid.",
            ));
        }
        if let Some(attachment) = &moment.attachment {
            if attachment.value.chars().count() > 8_000
                || !["link", "code"].contains(&attachment.r#type.as_str())
                || (attachment.r#type == "link"
                    && !(attachment.value.starts_with("https://")
                        || attachment.value.starts_with("http://")))
            {
                return Err(error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "An attachment is not valid.",
                ));
            }
        }
    }
    if payload
        .next_tasks
        .iter()
        .any(|task| task.text.trim().is_empty() || task.text.chars().count() > 240)
    {
        return Err(error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "A practice task is not valid.",
        ));
    }
    Ok(())
}

async fn rate_limit(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(), (StatusCode, Json<ErrorBody>)> {
    let key = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .unwrap_or("local")
        .trim()
        .to_string();
    let mut attempts = state.attempts.lock().await;
    let entry = attempts.entry(key).or_insert((Instant::now(), 0));
    if entry.0.elapsed() > Duration::from_secs(60) {
        *entry = (Instant::now(), 0);
    }
    entry.1 += 1;
    if entry.1 > 20 {
        return Err(error(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many links were created. Wait a minute and try again.",
        ));
    }
    Ok(())
}

fn random_token(length: usize) -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect()
}
fn valid_token(value: &str, length: usize) -> bool {
    value.len() == length && value.bytes().all(|byte| byte.is_ascii_alphanumeric())
}
fn constant_time_equal(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |diff, (x, y)| diff | (x ^ y)) == 0
}

async fn security_headers(request: Request<Body>, next: Next) -> Response {
    let path = request.uri().path().to_owned();
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(header::CONTENT_SECURITY_POLICY, HeaderValue::from_static("default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' https://api.sociobot.in; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://api.sociobot.in"));
    headers.insert(
        HeaderName::from_static("permissions-policy"),
        HeaderValue::from_static("camera=(), microphone=(), geolocation=()"),
    );
    let cache = if path.starts_with("/assets/index-") {
        "public, max-age=31536000, immutable"
    } else if path.starts_with("/assets/") {
        "public, max-age=86400"
    } else {
        "no-cache"
    };
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static(cache));
    response
}

pub async fn cleanup_expired(pool: &SqlitePool) -> Result<u64, sqlx::Error> {
    Ok(sqlx::query("DELETE FROM shares WHERE expires_at < ?")
        .bind(Utc::now().to_rfc3339())
        .execute(pool)
        .await?
        .rows_affected())
}
