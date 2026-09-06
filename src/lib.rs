use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    path::PathBuf,
    sync::{Arc, Once},
    time::{Duration, Instant},
};

use axum::{
    body::Body,
    extract::{connect_info::ConnectInfo, DefaultBodyLimit, Path, Query, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Request, StatusCode},
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::{get, get_service, post},
    Json, Router,
};
use chrono::{DateTime, Days, Utc};
use rand::{distr::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{any::AnyPoolOptions, AnyPool, Row};
use tokio::sync::Mutex;
use tower_http::{
    limit::RequestBodyLimitLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

#[derive(Clone)]
pub struct AppState {
    pub pool: AnyPool,
    attempts: Arc<Mutex<HashMap<String, (Instant, u32)>>>,
    requests: Arc<Mutex<HashMap<String, (Instant, u32)>>>,
    billing_product_url: Arc<str>,
    billing_client: reqwest::Client,
}

const BUILD_SHA: &str = env!("BUILD_SHA");
const BILLING_PRODUCT_URL: &str = "https://api.sociobot.in/api/v1/products/tutor-session-trace";
static SQLX_DRIVERS: Once = Once::new();

pub fn database_pool_options() -> AnyPoolOptions {
    SQLX_DRIVERS.call_once(sqlx::any::install_default_drivers);
    AnyPoolOptions::new()
}

impl AppState {
    pub fn new(pool: AnyPool) -> Self {
        Self::with_billing_product_url(pool, BILLING_PRODUCT_URL)
    }

    pub fn with_billing_product_url(
        pool: AnyPool,
        billing_product_url: impl Into<Arc<str>>,
    ) -> Self {
        Self {
            pool,
            attempts: Arc::new(Mutex::new(HashMap::new())),
            requests: Arc::new(Mutex::new(HashMap::new())),
            billing_product_url: billing_product_url.into(),
            billing_client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(3))
                .timeout(Duration::from_secs(5))
                .build()
                .expect("the built-in HTTP client configuration is valid"),
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

    let client_routes = Router::new()
        .route("/", get_service(ServeFile::new(index.clone())))
        .route("/demo", get_service(ServeFile::new(index.clone())))
        .route("/privacy", get_service(ServeFile::new(index.clone())))
        .route("/terms", get_service(ServeFile::new(index.clone())))
        .route("/s/{id}", get_service(ServeFile::new(index)));

    let static_routes = Router::new()
        .nest_service("/assets", ServeDir::new(frontend.join("assets")))
        .nest_service("/icons", ServeDir::new(frontend.join("icons")))
        .route_service("/404.css", ServeFile::new(frontend.join("404.css")))
        .route_service("/favicon.svg", ServeFile::new(frontend.join("favicon.svg")))
        .route_service(
            "/manifest.webmanifest",
            ServeFile::new(frontend.join("manifest.webmanifest")),
        )
        .route_service("/robots.txt", ServeFile::new(frontend.join("robots.txt")))
        .route_service("/sitemap.xml", ServeFile::new(frontend.join("sitemap.xml")))
        .route_service("/sw.js", ServeFile::new(frontend.join("sw.js")));

    Router::new()
        .route("/health", get(health))
        .merge(share_routes)
        .merge(client_routes)
        .merge(static_routes)
        // Known browser routes above receive the SPA shell with 200. Unknown
        // paths retain a genuine 404, with a usable product page rather than
        // ServeDir's empty fallback response.
        .fallback(not_found_page)
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

struct AppError {
    status: StatusCode,
    message: String,
    retry_after: Option<&'static str>,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let mut response = (
            self.status,
            Json(ErrorBody {
                error: self.message,
            }),
        )
            .into_response();
        if let Some(retry_after) = self.retry_after {
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, HeaderValue::from_static(retry_after));
        }
        response
    }
}

fn error(status: StatusCode, message: impl Into<String>) -> AppError {
    AppError {
        status,
        message: message.into(),
        retry_after: None,
    }
}

fn rate_error(retry_after: &'static str, message: impl Into<String>) -> AppError {
    AppError {
        status: StatusCode::TOO_MANY_REQUESTS,
        message: message.into(),
        retry_after: Some(retry_after),
    }
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "build": BUILD_SHA }))
}

async fn not_found_page() -> (StatusCode, Html<&'static str>) {
    (
        StatusCode::NOT_FOUND,
        Html(include_str!("../frontend/public/404.html")),
    )
}

async fn create_share(
    State(state): State<AppState>,
    ConnectInfo(client): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<CreateShare>,
) -> Result<impl IntoResponse, AppError> {
    rate_limit_api(&state, client, &headers).await?;
    rate_limit_create(&state, client, &headers).await?;
    validate(&payload)?;
    require_paid_expiry(&state, &headers, payload.expires_days).await?;

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
    sqlx::query("INSERT INTO shares (id, delete_key, content, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)")
        .bind(&id).bind(&delete_key).bind(content.to_string()).bind(now.to_rfc3339()).bind(expires.to_rfc3339())
        .execute(&state.pool).await
        .map_err(|_| error(StatusCode::INTERNAL_SERVER_ERROR, "The link could not be saved. Try again."))?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": id, "delete_key": delete_key, "expires_at": expires.to_rfc3339() })),
    ))
}

#[derive(Deserialize)]
struct LicenseVerdict {
    valid: bool,
}

async fn require_paid_expiry(
    state: &AppState,
    headers: &HeaderMap,
    expires_days: u64,
) -> Result<(), AppError> {
    if expires_days <= 7 {
        return Ok(());
    }

    let Some(token) = headers
        .get("x-sociobot-license")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|token| !token.is_empty() && token.len() <= 4096)
    else {
        return Err(error(
            StatusCode::FORBIDDEN,
            "A valid paid license is required for links longer than seven days.",
        ));
    };

    // The browser's cached entitlement only controls its presentation. The
    // server repeats verification for every paid-duration creation so a
    // modified request cannot bypass the paid boundary.
    let valid = match state
        .billing_client
        .get(format!(
            "{}/verify",
            state.billing_product_url.trim_end_matches('/')
        ))
        .query(&[("license", token)])
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => response
            .json::<LicenseVerdict>()
            .await
            .map(|verdict| verdict.valid)
            .unwrap_or(false),
        _ => false,
    };

    if valid {
        Ok(())
    } else {
        Err(error(
            StatusCode::FORBIDDEN,
            "A valid paid license is required for links longer than seven days.",
        ))
    }
}

async fn get_share(
    State(state): State<AppState>,
    ConnectInfo(client): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    rate_limit_api(&state, client, &headers).await?;
    if !valid_token(&id, 22) {
        return Err(error(
            StatusCode::NOT_FOUND,
            "This recap could not be found.",
        ));
    }
    let row = sqlx::query("SELECT content, expires_at FROM shares WHERE id = $1")
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
        let _ = sqlx::query("DELETE FROM shares WHERE id = $1")
            .bind(&id)
            .execute(&state.pool)
            .await;
        return Err(error(StatusCode::GONE, "This recap has expired."));
    }
    sqlx::query("UPDATE shares SET open_count = open_count + 1 WHERE id = $1")
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
    ConnectInfo(client): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<KeyQuery>,
) -> Result<Json<Value>, AppError> {
    rate_limit_api(&state, client, &headers).await?;
    let row = sqlx::query("SELECT delete_key, open_count, expires_at FROM shares WHERE id = $1")
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
    ConnectInfo(client): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<KeyQuery>,
) -> Result<StatusCode, AppError> {
    rate_limit_api(&state, client, &headers).await?;
    let result = sqlx::query("DELETE FROM shares WHERE id = $1 AND delete_key = $2")
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

fn validate(payload: &CreateShare) -> Result<(), AppError> {
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

async fn rate_limit_create(
    state: &AppState,
    client: SocketAddr,
    headers: &HeaderMap,
) -> Result<(), AppError> {
    let key = client_key(client, headers);
    let mut attempts = state.attempts.lock().await;
    let entry = attempts.entry(key).or_insert((Instant::now(), 0));
    if entry.0.elapsed() > Duration::from_secs(60) {
        *entry = (Instant::now(), 0);
    }
    entry.1 += 1;
    if entry.1 > 20 {
        return Err(rate_error(
            "60",
            "Too many links were created. Wait a minute and try again.",
        ));
    }
    Ok(())
}

async fn rate_limit_api(
    state: &AppState,
    client: SocketAddr,
    headers: &HeaderMap,
) -> Result<(), AppError> {
    let key = client_key(client, headers);
    let mut requests = state.requests.lock().await;
    let entry = requests.entry(key).or_insert((Instant::now(), 0));
    if entry.0.elapsed() > Duration::from_secs(1) {
        *entry = (Instant::now(), 0);
    }
    entry.1 += 1;
    if entry.1 > 100 {
        return Err(rate_error(
            "1",
            "Too many requests. Wait a second and try again.",
        ));
    }
    Ok(())
}

fn client_key(client: SocketAddr, headers: &HeaderMap) -> String {
    let peer = client.ip();
    if let Some(external_ip) = headers
        .get("x-envoy-external-address")
        .and_then(|value| value.to_str().ok())
        .and_then(parse_forwarded_ip)
    {
        return external_ip.to_string();
    }
    let trusted_proxy = peer.is_loopback()
        || match peer {
            std::net::IpAddr::V4(address) => address.is_private(),
            std::net::IpAddr::V6(address) => address.is_unique_local(),
        }
        || (headers.contains_key("x-forwarded-proto") && headers.contains_key("x-request-id"));
    if trusted_proxy {
        if let Some(forwarded_ip) = headers
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(',').next())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .and_then(parse_forwarded_ip)
        {
            return forwarded_ip.to_string();
        }
    }
    peer.to_string()
}

fn parse_forwarded_ip(value: &str) -> Option<IpAddr> {
    let value = value.trim_matches('"');
    value
        .parse::<IpAddr>()
        .ok()
        .or_else(|| value.parse::<SocketAddr>().ok().map(|address| address.ip()))
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
    headers.insert(
        header::STRICT_TRANSPORT_SECURITY,
        HeaderValue::from_static("max-age=31536000; includeSubDomains"),
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

pub async fn cleanup_expired(pool: &AnyPool) -> Result<u64, sqlx::Error> {
    Ok(sqlx::query("DELETE FROM shares WHERE expires_at < $1")
        .bind(Utc::now().to_rfc3339())
        .execute(pool)
        .await?
        .rows_affected())
}
