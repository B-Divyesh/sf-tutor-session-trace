FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json vite.config.ts tsconfig.json ./
COPY frontend ./frontend
RUN npm ci && npm run build

FROM rust:1.98-bookworm AS backend
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY migrations ./migrations
COPY src ./src
ARG BUILD_SHA=container
ENV BUILD_SHA=$BUILD_SHA
RUN cargo build --locked --release

FROM debian:bookworm-slim AS runtime
RUN groupadd --system trace && useradd --system --gid trace --home-dir /app trace \
    && mkdir -p /app/dist /data && chown -R trace:trace /app /data
WORKDIR /app
COPY --from=backend /build/target/release/tutor-session-trace /usr/local/bin/tutor-session-trace
COPY --from=frontend /build/dist ./dist
USER trace
ENV PORT=8080 \
    DATABASE_URL=sqlite:///data/trace.db \
    FRONTEND_DIR=/app/dist \
    RUST_LOG=info
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["/usr/local/bin/tutor-session-trace"]
