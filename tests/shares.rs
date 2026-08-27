use std::path::PathBuf;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::sqlite::SqlitePoolOptions;
use tower::ServiceExt;
use tutor_session_trace::{app, AppState};

async fn test_app() -> axum::Router {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::migrate!().run(&pool).await.unwrap();
    app(AppState::new(pool), PathBuf::from("dist"))
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
async fn health_includes_build_identity_and_security_headers() {
    let response = test_app()
        .await
        .oneshot(Request::get("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["x-content-type-options"], "nosniff");
    assert_eq!(json_body(response).await["status"], "ok");
}
