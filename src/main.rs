use std::{env, net::SocketAddr, path::PathBuf, time::Duration};

use tokio::net::TcpListener;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;
use tutor_session_trace::{app, cleanup_expired, database_pool_options, AppState};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .init();

    let port_supplied = env::var_os("PORT").is_some();
    let database_supplied = env::var_os("DATABASE_URL").is_some();
    let frontend_supplied = env::var_os("FRONTEND_DIR").is_some();
    let billing_supplied = env::var_os("SOCIOBOT_BILLING_PRODUCT_URL").is_some();
    let port: u16 = env::var("PORT").unwrap_or_else(|_| "8080".into()).parse()?;
    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://data/trace.db".into());
    if let Some(path) = database_url.strip_prefix("sqlite://") {
        let path = std::path::Path::new(path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)?;
    }
    // PostgreSQL is the production shared persistence boundary. Limiting the
    // local SQLite fallback to one connection keeps developer/test locking
    // predictable without making replica-local SQLite a deployment option.
    let pool = database_pool_options()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&database_url)
        .await?;
    sqlx::migrate!().run(&pool).await?;
    let removed = cleanup_expired(&pool).await?;
    if removed > 0 {
        info!(removed, "expired shares removed");
    }

    let frontend = PathBuf::from(env::var("FRONTEND_DIR").unwrap_or_else(|_| "dist".into()));
    let billing_product_url = env::var("SOCIOBOT_BILLING_PRODUCT_URL")
        .unwrap_or_else(|_| "https://api.sociobot.in/api/v1/products/tutor-session-trace".into());
    info!(
        port = if port_supplied { "supplied" } else { "default" },
        database = if database_supplied {
            "supplied"
        } else {
            "default"
        },
        frontend = if frontend_supplied {
            "supplied"
        } else {
            "default"
        },
        billing = if billing_supplied {
            "supplied"
        } else {
            "default"
        },
        "configuration sources"
    );
    let router = app(
        AppState::with_billing_product_url(pool, billing_product_url),
        frontend,
    );
    let address = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(address).await?;
    info!(%address, "Tutor Session Trace listening");
    axum::serve(
        listener,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown())
    .await?;
    Ok(())
}

async fn shutdown() {
    let ctrl_c = async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            warn!(%error, "failed to listen for ctrl-c");
        }
    };
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => warn!(%error, "failed to listen for terminate"),
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
}
