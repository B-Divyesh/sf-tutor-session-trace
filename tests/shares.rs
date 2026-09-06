use std::{
    net::SocketAddr,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    body::Body,
    extract::connect_info::ConnectInfo,
    extract::Query,
    http::{Request, StatusCode},
    routing::get,
    Extension, Json, Router,
};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tower::ServiceExt;
use tutor_session_trace::{app, cleanup_expired, database_pool_options, AppState};

fn test_frontend() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let directory = std::env::temp_dir().join(format!("tutor-session-trace-frontend-{nonce}"));
    std::fs::create_dir_all(&directory).unwrap();
    std::fs::write(
        directory.join("index.html"),
        "<!doctype html><title>Trace</title>",
    )
    .unwrap();
    directory
}

async fn test_app() -> axum::Router {
    test_app_with_peer("203.0.113.10:443").await
}

async fn test_app_with_peer(peer: &str) -> axum::Router {
    let pool = database_pool_options()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::migrate!().run(&pool).await.unwrap();
    app(AppState::new(pool), test_frontend())
        .layer(Extension(ConnectInfo(peer.parse::<SocketAddr>().unwrap())))
}

fn valid_payload() -> Value {
    json!({
        "student_name": "Mina",
        "session_title": "Recursive trees",
        "session_date": "2026-08-27",
        "summary": "Name the base case first.",
        "moments": [{
            "id": "moment-1",
            "at": "2026-08-27T10:02:00Z",
            "kind": "attempt",
            "outcome": "progressing",
            "note": "Traced two nested calls.",
            "attachment": null
        }],
        "next_tasks": [{ "id": "task-1", "text": "Trace a depth-three tree", "done": false }],
        "consent": true,
        "expires_days": 7
    })
}

async fn json_body(response: axum::response::Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

async fn expired_share_service() -> (axum::Router, sqlx::AnyPool, String) {
    let pool = database_pool_options()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::migrate!().run(&pool).await.unwrap();
    let id = "abcdefghijklmnopqrstuv".to_owned();
    let content = json!({
        "student_name": "Mina",
        "session_title": "Expired lifecycle proof",
        "session_date": "2026-08-30",
        "summary": "This fixture has expired.",
        "moments": [],
        "next_tasks": []
    });
    sqlx::query("INSERT INTO shares (id, delete_key, content, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)")
        .bind(&id)
        .bind("expired-fixture-key")
        .bind(content.to_string())
        .bind((Utc::now() - Duration::days(2)).to_rfc3339())
        .bind((Utc::now() - Duration::days(1)).to_rfc3339())
        .execute(&pool)
        .await
        .unwrap();
    let service = app(AppState::new(pool.clone()), test_frontend()).layer(Extension(ConnectInfo(
        "203.0.113.10:443".parse::<SocketAddr>().unwrap(),
    )));
    (service, pool, id)
}

#[tokio::test]
async fn share_lifecycle_records_opens_and_revokes() {
    let service = test_app().await;
    let response = service
        .clone()
        .oneshot(
            Request::post("/api/shares")
                .header("content-type", "application/json")
                .body(Body::from(valid_payload().to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    let created = json_body(response).await;
    let id = created["id"].as_str().unwrap();
    let key = created["delete_key"].as_str().unwrap();

    let opened = service
        .clone()
        .oneshot(
            Request::get(format!("/api/shares/{id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(opened.status(), StatusCode::OK);
    let recap = json_body(opened).await;
    assert_eq!(recap["student_name"], "Mina");

    let status = service
        .clone()
        .oneshot(
            Request::get(format!("/api/shares/{id}/status?key={key}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(json_body(status).await["opens"], 1);

    let deleted = service
        .clone()
        .oneshot(
            Request::delete(format!("/api/shares/{id}?key={key}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(deleted.status(), StatusCode::NO_CONTENT);
    let missing = service
        .oneshot(
            Request::get(format!("/api/shares/{id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
}

// @claim:shared-recap-lifecycle
#[tokio::test]
async fn claim_shared_recap_lifecycle() {
    let service = test_app().await;
    let created = service
        .clone()
        .oneshot(
            Request::post("/api/shares")
                .header("content-type", "application/json")
                .body(Body::from(valid_payload().to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(created.status(), StatusCode::CREATED);
    let created = json_body(created).await;
    let id = created["id"].as_str().unwrap().to_owned();
    let key = created["delete_key"].as_str().unwrap().to_owned();
    let expiry = chrono::DateTime::parse_from_rfc3339(created["expires_at"].as_str().unwrap())
        .unwrap()
        .with_timezone(&Utc);
    assert!(
        (expiry - Utc::now() - Duration::days(7))
            .num_seconds()
            .abs()
            < 10
    );

    let opened = service
        .clone()
        .oneshot(
            Request::get(format!("/api/shares/{id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(opened.status(), StatusCode::OK);
    let status = service
        .clone()
        .oneshot(
            Request::get(format!("/api/shares/{id}/status?key={key}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(json_body(status).await["opens"], 1);
    let deleted = service
        .clone()
        .oneshot(
            Request::delete(format!("/api/shares/{id}?key={key}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(deleted.status(), StatusCode::NO_CONTENT);

    let (expired_service, pool, expired_id) = expired_share_service().await;
    let expired = expired_service
        .oneshot(
            Request::get(format!("/api/shares/{expired_id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(expired.status(), StatusCode::GONE);
    let remaining = sqlx::query("SELECT id FROM shares WHERE id = $1")
        .bind(&expired_id)
        .fetch_optional(&pool)
        .await
        .unwrap();
    assert!(remaining.is_none(), "opening an expired recap removes it");
}

// @claim:expired-share-cleanup
#[tokio::test]
async fn claim_expired_share_cleanup() {
    let (_service, pool, expired_id) = expired_share_service().await;
    let removed = cleanup_expired(&pool).await.unwrap();
    assert_eq!(removed, 1, "routine cleanup removes the expired recap");
    let expired = sqlx::query("SELECT id FROM shares WHERE id = $1")
        .bind(&expired_id)
        .fetch_optional(&pool)
        .await
        .unwrap();
    assert!(
        expired.is_none(),
        "expired recap remains unavailable after cleanup"
    );
}

#[tokio::test]
async fn consent_is_required_and_private_fields_are_rejected() {
    let service = test_app().await;
    let mut no_consent = valid_payload();
    no_consent["consent"] = json!(false);
    let response = service
        .clone()
        .oneshot(
            Request::post("/api/shares")
                .header("content-type", "application/json")
                .body(Body::from(no_consent.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);

    let mut private = valid_payload();
    private["moments"][0]["private"] = json!(true);
    let response = service
        .oneshot(
            Request::post("/api/shares")
                .header("content-type", "application/json")
                .body(Body::from(private.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn paid_expiry_cannot_be_created_without_a_server_verified_license() {
    let service = test_app().await;
    let mut paid_expiry = valid_payload();
    paid_expiry["expires_days"] = json!(30);

    let response = service
        .oneshot(
            Request::post("/api/shares")
                .header("content-type", "application/json")
                .body(Body::from(paid_expiry.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert!(json_body(response).await["error"]
        .as_str()
        .unwrap()
        .contains("license"));
}

#[derive(Deserialize)]
struct VerifyQuery {
    license: String,
}

#[derive(Serialize)]
struct VerifyResponse {
    valid: bool,
    reason: &'static str,
}

async fn verification_stub(Query(query): Query<VerifyQuery>) -> Json<VerifyResponse> {
    Json(VerifyResponse {
        valid: query.license == "valid-license-token",
        reason: if query.license == "valid-license-token" {
            "ok"
        } else {
            "invalid"
        },
    })
}

#[tokio::test]
async fn paid_expiry_requires_the_sociobot_verdict_not_a_client_flag() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let verifier = tokio::spawn(async move {
        axum::serve(
            listener,
            Router::new().route(
                "/api/v1/products/tutor-session-trace/verify",
                get(verification_stub),
            ),
        )
        .await
        .unwrap();
    });

    let pool = database_pool_options()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::migrate!().run(&pool).await.unwrap();
    let service = app(
        AppState::with_billing_product_url(
            pool,
            format!("http://{address}/api/v1/products/tutor-session-trace"),
        ),
        test_frontend(),
    )
    .layer(Extension(ConnectInfo(
        "203.0.113.10:443".parse::<SocketAddr>().unwrap(),
    )));
    let mut paid_expiry = valid_payload();
    paid_expiry["expires_days"] = json!(30);

    let denied = service
        .clone()
        .oneshot(
            Request::post("/api/shares")
                .header("content-type", "application/json")
                .header("x-sociobot-license", "a-forged-local-paid-flag")
                .body(Body::from(paid_expiry.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(denied.status(), StatusCode::FORBIDDEN);

    let allowed = service
        .oneshot(
            Request::post("/api/shares")
                .header("content-type", "application/json")
                .header("x-sociobot-license", "valid-license-token")
                .body(Body::from(paid_expiry.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(allowed.status(), StatusCode::CREATED);
    verifier.abort();
}

#[tokio::test]
async fn legal_routes_have_real_success_responses_and_unknown_paths_do_not() {
    let service = test_app().await;
    for path in [
        "/",
        "/demo",
        "/privacy",
        "/terms",
        "/s/abcdefghijklmnopqrstuvwxyz",
    ] {
        let response = service
            .clone()
            .oneshot(Request::get(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{path}");
    }
    let missing = service
        .oneshot(
            Request::get("/not-a-product-route")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    let body = missing.into_body().collect().await.unwrap().to_bytes();
    let page = String::from_utf8(body.to_vec()).unwrap();
    assert!(page.contains("This page could not be found"));
    assert!(page.contains("<main"));
}

#[tokio::test]
async fn health_includes_build_identity_and_security_headers() {
    let response = test_app()
        .await
        .oneshot(Request::get("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["x-content-type-options"], "nosniff");
    assert_eq!(
        response.headers()["strict-transport-security"],
        "max-age=31536000; includeSubDomains"
    );
    let health = json_body(response).await;
    assert_eq!(health["status"], "ok");
    let build = health["build"].as_str().unwrap();
    let expected = option_env!("BUILD_SHA")
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("dev");
    assert_eq!(build, expected);
    assert!(
        build == "dev" || (build.len() == 40 && build.bytes().all(|byte| byte.is_ascii_hexdigit()))
    );
}

#[tokio::test]
async fn forwarded_headers_cannot_bypass_the_peer_rate_limit() {
    let service = test_app().await;
    for request_number in 0..20 {
        let response = service
            .clone()
            .oneshot(
                Request::post("/api/shares")
                    .header("content-type", "application/json")
                    .header("x-forwarded-for", format!("198.51.100.{request_number}"))
                    .body(Body::from(valid_payload().to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);
    }

    let blocked = service
        .oneshot(
            Request::post("/api/shares")
                .header("content-type", "application/json")
                .header("x-forwarded-for", "203.0.113.250")
                .body(Body::from(valid_payload().to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(blocked.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(blocked.headers()["retry-after"], "60");
}

#[tokio::test]
async fn forwarded_source_ports_share_one_rate_window_behind_a_proxy() {
    let service = test_app_with_peer("10.0.0.8:443").await;
    for source_port in 10_000..10_020 {
        let response = service
            .clone()
            .oneshot(
                Request::post("/api/shares")
                    .header("content-type", "application/json")
                    .header("x-forwarded-for", format!("198.51.100.42:{source_port}"))
                    .body(Body::from(valid_payload().to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);
    }

    let blocked = service
        .oneshot(
            Request::post("/api/shares")
                .header("content-type", "application/json")
                .header("x-forwarded-for", "198.51.100.42:20000")
                .body(Body::from(valid_payload().to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(blocked.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(blocked.headers()["retry-after"], "60");
}

#[tokio::test]
async fn envoy_external_address_is_the_stable_ingress_rate_key() {
    let service = test_app().await;
    for request_number in 0..20 {
        let response = service
            .clone()
            .oneshot(
                Request::post("/api/shares")
                    .header("content-type", "application/json")
                    .header(
                        "x-envoy-external-address",
                        format!("198.51.100.42:{}", 10_000 + request_number),
                    )
                    .header("x-forwarded-for", format!("203.0.113.{request_number}"))
                    .body(Body::from(valid_payload().to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);
    }

    let blocked = service
        .oneshot(
            Request::post("/api/shares")
                .header("content-type", "application/json")
                .header("x-envoy-external-address", "198.51.100.42:20000")
                .header("x-forwarded-for", "203.0.113.250")
                .body(Body::from(valid_payload().to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(blocked.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(blocked.headers()["retry-after"], "60");
}

#[tokio::test]
async fn every_share_endpoint_has_a_bounded_rate_window_and_retry_header() {
    let service = test_app().await;
    for _ in 0..100 {
        let response = service
            .clone()
            .oneshot(
                Request::get("/api/shares/not-a-valid-id")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
    let blocked = service
        .oneshot(
            Request::get("/api/shares/not-a-valid-id")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(blocked.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(blocked.headers()["retry-after"], "1");
}

async fn durable_app(database_url: &str, peer: &str) -> axum::Router {
    let path = std::path::Path::new(database_url.strip_prefix("sqlite://").unwrap());
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .unwrap();
    let pool = database_pool_options()
        .max_connections(1)
        .connect(database_url)
        .await
        .unwrap();
    sqlx::migrate!().run(&pool).await.unwrap();
    app(AppState::new(pool), test_frontend())
        .layer(Extension(ConnectInfo(peer.parse::<SocketAddr>().unwrap())))
}

#[tokio::test]
async fn durable_database_keeps_recaps_consistent_between_instances_and_after_delete() {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir().join(format!("tutor-session-trace-{nonce}.db"));
    let database_url = format!("sqlite://{}", path.display());
    let first = durable_app(&database_url, "203.0.113.21:443").await;

    let created = first
        .clone()
        .oneshot(
            Request::post("/api/shares")
                .header("content-type", "application/json")
                .body(Body::from(valid_payload().to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(created.status(), StatusCode::CREATED);
    let created = json_body(created).await;
    let id = created["id"].as_str().unwrap().to_owned();
    let key = created["delete_key"].as_str().unwrap().to_owned();

    // A separately opened pool models a restarted process reading the same
    // durable volume. Both services must see exactly the same recap.
    let second = durable_app(&database_url, "203.0.113.22:443").await;
    for service in [&first, &second, &first, &second] {
        let response = service
            .clone()
            .oneshot(
                Request::get(format!("/api/shares/{id}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    let deleted = second
        .clone()
        .oneshot(
            Request::delete(format!("/api/shares/{id}?key={key}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(deleted.status(), StatusCode::NO_CONTENT);
    for service in [&first, &second] {
        let response = service
            .clone()
            .oneshot(
                Request::get(format!("/api/shares/{id}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
    drop((first, second));
    let _ = std::fs::remove_file(path);
}

#[tokio::test]
async fn concurrent_opens_of_one_recap_are_all_consistent() {
    let service = test_app().await;
    let created = service
        .clone()
        .oneshot(
            Request::post("/api/shares")
                .header("content-type", "application/json")
                .body(Body::from(valid_payload().to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let id = json_body(created).await["id"].as_str().unwrap().to_owned();

    let mut opens = tokio::task::JoinSet::new();
    for _ in 0..50 {
        let service = service.clone();
        let id = id.clone();
        opens.spawn(async move {
            service
                .oneshot(
                    Request::get(format!("/api/shares/{id}"))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap()
                .status()
        });
    }
    while let Some(result) = opens.join_next().await {
        assert_eq!(result.unwrap(), StatusCode::OK);
    }
}
