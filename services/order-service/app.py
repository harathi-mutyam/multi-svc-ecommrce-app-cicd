from flask import Flask, jsonify, request
from prometheus_flask_exporter import PrometheusMetrics
import os, psycopg2

app = Flask(__name__)
PrometheusMetrics(app)

def conn():
    return psycopg2.connect(
        host=os.getenv("DB_HOST","order-db"),
        dbname=os.getenv("DB_NAME","orders"),
        user=os.getenv("DB_USER","ecommerce"),
        password=os.getenv("DB_PASSWORD","ecommerce123")
    )

def init_db():
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS orders(
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                status VARCHAR(30) NOT NULL DEFAULT 'CREATED'
            )""")

@app.get("/health")
def health(): return jsonify(status="UP", service="order-service")

@app.get("/orders")
def orders():
    init_db()
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("SELECT id,user_id,product_id,quantity,status FROM orders ORDER BY id DESC")
            return jsonify([{"id":r[0],"user_id":r[1],"product_id":r[2],"quantity":r[3],"status":r[4]} for r in cur.fetchall()])

@app.post("/orders")
def create_order():
    init_db()
    data=request.get_json(force=True)
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("""INSERT INTO orders(user_id,product_id,quantity)
                           VALUES(%s,%s,%s) RETURNING id,user_id,product_id,quantity,status""",
                        (data.get("user_id",1),data["product_id"],data.get("quantity",1)))
            r=cur.fetchone()
            return jsonify({"id":r[0],"user_id":r[1],"product_id":r[2],"quantity":r[3],"status":r[4]}),201

if __name__ == "__main__":
    app.run(host="0.0.0.0",port=5003)
