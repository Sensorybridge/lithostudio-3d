FROM node:20-alpine
WORKDIR /app
COPY . /app
EXPOSE 8080
CMD ["node", "mcp-http-server.mjs"]
