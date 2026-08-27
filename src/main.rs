use std::{env, net::SocketAddr, path::PathBuf, time::Duration};

use sqlx::{sqlite::SqliteConnectOptions, sqlite::SqlitePoolOptions};
use tokio::net::TcpListener;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;
use tutor_session_trace::{app, cleanup_expired, AppState};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .init();

    let port: u16 = env::var("PORT").unwrap_or_else(|_| "8080".into()).parse()?;
    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://data/trace.db".into());
    if database_url == "sqlite://data/trace.db" {
        std::fs::create_dir_all("data")?;
    }
    let options: SqliteConnectOptions = database_url
        .parse::<SqliteConnectOptions>()?
        .create_if_missing(true)
        .foreign_keys(true);
    // This deployment is deliberately one replica backed by a durable mounted
    // volume. A single connection keeps SQLite's locking local and predictable.
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .connect_with(options)
        .await?;
    sqlx::migrate!().run(&pool).await?;
    let removed = cleanup_expired(&pool).await?;
    if removed > 0 {
        info!(removed, "expired shares removed");
    }

    let frontend = PathBuf::from(env::var("FRONTEND_DIR").unwrap_or_else(|_| "dist".into()));
    let router = app(AppState::new(pool), frontend);
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
