FROM oven/bun:latest

WORKDIR /app

COPY . .

RUN apt-get -y update
RUN apt-get install -y procps && rm -rf /var/lib/apt/lists/*

RUN bun install --verbose

ENTRYPOINT ["sh", "-c", "bun run --bun start"]