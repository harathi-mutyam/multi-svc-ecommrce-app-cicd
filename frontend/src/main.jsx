
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API = "/api";

const productNames = {
  "Developer Laptop": "Premium Laptop",
  "Studio Headphones": "Wireless Bluetooth Headphones",
  "Mechanical Keyboard": "Smartwatch"
};

const productDescriptions = {
  "Developer Laptop": "Powerful performance for work, entertainment and everyday use.",
  "Studio Headphones": "Enjoy premium sound quality with wireless freedom.",
  "Mechanical Keyboard": "Stay connected with smart fitness and lifestyle features."
};

function App() {
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState("");
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    fetch(`${API}/products`)
      .then((response) => {
        if (!response.ok) throw new Error("Products unavailable");
        return response.json();
      })
      .then(setProducts)
      .catch(() => setMessage("Unable to load products. Please try again."));
  }, []);

  async function createOrder(product) {
    setMessage("Processing your order...");

    try {
      const response = await fetch(`${API}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: 1,
          product_id: product.id,
          quantity: 1
        })
      });

      if (!response.ok) throw new Error("Order failed");

      const data = await response.json();

      setOrders((previous) => [
        ...previous,
        {
          id: data.id,
          name: productNames[product.name] || product.name
        }
      ]);

      setMessage(
        `Order #${data.id} placed successfully for ${
          productNames[product.name] || product.name
        }`
      );
    } catch {
      setMessage("Unable to place your order. Please try again.");
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">Ecommerce Cart</div>

        <nav>
          <a href="#products">Categories</a>
          <a href="#products">Products</a>
          <a href="#cart">Cart</a>
          <a href="#orders">Orders ({orders.length})</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div>
            <span className="eyebrow">
              ONLINE SHOPPING STORE
            </span>

            <h1>
              Discover Amazing Deals on Your Favorite Products
            </h1>

            <p>
              Shop the latest electronics, fashion and home
              essentials at great prices. Discover quality products
              and enjoy a convenient online shopping experience.
            </p>

            <a className="button" href="#products">
              Shop Now
            </a>
          </div>

          <div className="hero-card">
            <h2>Why Shop With Us?</h2>

            <p>🚚 Free Delivery on Eligible Orders</p>
            <p>🔒 Secure Shopping Experience</p>
            <p>↩️ Easy Returns</p>
            <p>⭐ Quality Products at Great Prices</p>

            <small>
              Welcome to Ecommerce Cart
            </small>
          </div>
        </section>

        <section id="products" className="section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                EXPLORE OUR COLLECTION
              </span>
              <h2>Trending Products</h2>
            </div>

            <p>
              Discover our collection of electronics
              and everyday essentials.
            </p>
          </div>

          <div className="grid">
            {products.map((product) => (
              <article className="product" key={product.id}>
                <div className="product-icon">
                  {product.icon || "🛍️"}
                </div>

                <h3>
                  {productNames[product.name] || product.name}
                </h3>

                <p>
                  {productDescriptions[product.name] ||
                    product.description}
                </p>

                <div className="product-bottom">
                  <strong>
                    €{Number(product.price).toFixed(2)}
                  </strong>

                  <button onClick={() => createOrder(product)}>
                    Buy Now
                  </button>
                </div>
              </article>
            ))}
          </div>

          {message && (
            <div className="message" role="status">
              {message}
            </div>
          )}
        </section>

        <section id="cart" className="section architecture">
          <span className="eyebrow">SHOPPING CART</span>
          <h2>Your Shopping Cart</h2>
          <p>
            Browse our products and select Buy Now to place
            a demo order.
          </p>
          <a className="button" href="#products">
            Continue Shopping
          </a>
        </section>

        <section id="orders" className="section">
          <span className="eyebrow">ORDER HISTORY</span>
          <h2>Your Recent Orders</h2>

          {orders.length === 0 ? (
            <p>No orders placed during this session.</p>
          ) : (
            <div className="grid">
              {orders.map((order, index) => (
                <article className="product" key={index}>
                  <h3>Order #{order.id}</h3>
                  <p>{order.name}</p>
                  <strong>Order Placed</strong>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer>
        © 2026 Ecommerce Cart. All Rights Reserved.
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <App />
);

