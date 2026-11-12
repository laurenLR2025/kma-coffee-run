FROM python:3.12-slim
WORKDIR /app
COPY server.py index.html app.css app.js ./
ENV HOST=0.0.0.0 KMA_DB=/data/coffee.sqlite3 PORT=8080
EXPOSE 8080
CMD ["python", "server.py"]
