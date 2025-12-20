# Build stage
FROM rust:1.75-bookworm AS builder

WORKDIR /app

# Install dependencies for audio processing
RUN apt-get update && apt-get install -y \
    pkg-config \
    libasound2-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy Cargo files
COPY Cargo.toml Cargo.lock ./

# Create dummy main to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy actual source
COPY src ./src

# Build release binary
RUN touch src/main.rs && cargo build --release

# Runtime stage
FROM debian:bookworm-slim AS runner

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libasound2 \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user
RUN useradd --system --uid 1001 --create-home budi

# Copy binary
COPY --from=builder /app/target/release/worker-dsp ./worker-dsp

RUN chown budi:budi ./worker-dsp

USER budi

ENV RUST_LOG=info

CMD ["./worker-dsp"]
