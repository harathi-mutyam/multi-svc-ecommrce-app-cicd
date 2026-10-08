from flask import Flask, jsonify
from prometheus_flask_exporter import PrometheusMetrics
import os, psycopg2

app = Flask(__name__)
PrometheusMetrics(app)

def conn():
    return psycopg2.connect(
        host=os.getenv("DB_HOST","product-db"),
        dbname=os.getenv("DB_NAME","products"),
        user=os.getenv("DB_USER","ecommerce"),
        password=os.getenv("DB_PASSWORD","ecommerce123")
    )

def init_db():
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS products(
                id SERIAL PRIMARY KEY,
                name VARCHAR(120) NOT NULL,
                description TEXT,
                price NUMERIC(10,2) NOT NULL,
                icon VARCHAR(10)
            )""")
            cur.execute("SELECT COUNT(*) FROM products")
            if cur.fetchone()[0] == 0:
                cur.executemany(
                    "INSERT INTO products(name,description,price,icon) VALUES(%s,%s,%s,%s)",
                    [
                        ("Developer Laptop","Portable workstation for your cloud lab.",999.00,"⌘"),
                        ("Studio Headphones","Focused audio for long build sessions.",129.00,"◉"),
                        ("Mechanical Keyboard","Tactile keyboard for terminal-heavy work.",89.00,"⌨")
                    ]
                )

@app.get("/health")
def health(): return jsonify(status="UP", service="product-service")

@app.get("/products")
def products():
    init_db()
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("SELECT id,name,description,price,icon FROM products ORDER BY id")
            return jsonify([{"id":r[0],"name":r[1],"description":r[2],"price":float(r[3]),"icon":r[4]} for r in cur.fetchall()])

if __name__ == "__main__":
    app.run(host="0.0.0.0",port=5002)
