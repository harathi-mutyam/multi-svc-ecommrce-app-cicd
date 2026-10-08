from flask import Flask, jsonify
from prometheus_flask_exporter import PrometheusMetrics
import os, psycopg2

app = Flask(__name__)
PrometheusMetrics(app)

def conn():
    return psycopg2.connect(
        host=os.getenv("DB_HOST","user-db"),
        dbname=os.getenv("DB_NAME","users"),
        user=os.getenv("DB_USER","ecommerce"),
        password=os.getenv("DB_PASSWORD","ecommerce123")
    )

def init_db():
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS users(
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL
            )""")
            cur.execute("""INSERT INTO users(name,email) VALUES
                ('Demo Customer','demo@cloudcart.local')
                ON CONFLICT (email) DO NOTHING""")

@app.get("/health")
def health(): return jsonify(status="UP", service="user-service")

@app.get("/users")
def users():
    init_db()
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("SELECT id,name,email FROM users ORDER BY id")
            return jsonify([{"id":r[0],"name":r[1],"email":r[2]} for r in cur.fetchall()])

if __name__ == "__main__":
    app.run(host="0.0.0.0",port=5001)
