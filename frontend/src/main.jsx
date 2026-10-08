import React, {useEffect, useState} from "react";
import {createRoot} from "react-dom/client";
import "./styles.css";

const API = "/api";

function App() {
  const [products, setProducts] = useState([]);
  const [health, setHealth] = useState("Checking services...");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${API}/products`)
      .then(r => r.json())
      .then(setProducts)
      .catch(() => setMessage("Product service is not reachable."));
    Promise.all([
      fetch(`${API}/users/health`).then(r => r.ok),
      fetch(`${API}/products/health`).then(r => r.ok),
      fetch(`${API}/orders/health`).then(r => r.ok)
    ]).then(() => setHealth("All microservices are reachable"))
      .catch(() => setHealth("One or more services are unavailable"));
  }, []);

  async function createDemoOrder(product) {
    setMessage("Creating demo order...");
    try {
      const r = await fetch(`${API}/orders`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({user_id: 1, product_id: product.id, quantity: 1})
      });
      const data = await r.json();
      setMessage(`Order #${data.id} created for ${product.name}`);
    } catch {
      setMessage("Order service is not reachable.");
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">CloudCart</div>
        <nav><a href="#products">Products</a><a href="#architecture">Architecture</a></nav>
      </header>

      <main>
        <section className="hero">
          <div>
            <span className="eyebrow">DEVOPS DEMO STORE</span>
            <h1>Microservices, GitOps and observability in one project.</h1>
            <p>A presentation-ready e-commerce demo built with React, Flask, PostgreSQL, Docker, Kubernetes, Argo CD and AWS.</p>
            <a className="button" href="#products">Browse demo products</a>
          </div>
          <div className="hero-card">
            <div className="status-dot"></div>
            <strong>Platform status</strong>
            <p>{health}</p>
            <small>Frontend → API Gateway → independent services</small>
          </div>
        </section>

        <section id="products" className="section">
          <div className="section-heading">
            <div><span className="eyebrow">CATALOG</span><h2>Featured products</h2></div>
            <p>Each order travels through the API gateway to independently deployable services.</p>
          </div>
          <div className="grid">
            {products.map(p => (
              <article className="product" key={p.id}>
                <div className="product-icon">{p.icon || "◈"}</div>
                <h3>{p.name}</h3>
                <p>{p.description}</p>
                <div className="product-bottom">
                  <strong>€{Number(p.price).toFixed(2)}</strong>
                  <button onClick={() => createDemoOrder(p)}>Order demo</button>
                </div>
              </article>
            ))}
          </div>
          {message && <div className="message">{message}</div>}
        </section>

        <section id="architecture" className="section architecture">
          <span className="eyebrow">ARCHITECTURE</span>
          <h2>What this demo proves</h2>
          <div className="architecture-grid">
            <div><b>Frontend</b><span>React + Nginx</span></div>
            <div><b>Gateway</b><span>Nginx routing</span></div>
            <div><b>Services</b><span>User / Product / Order</span></div>
            <div><b>Data</b><span>PostgreSQL per service</span></div>
          </div>
        </section>
      </main>

      <footer>CloudCart • E-Commerce Microservices CI/CD Demo</footer>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
