#!/usr/bin/env bash
set -e
curl -fsS http://localhost:8081/health
echo
curl -fsS http://localhost:8081/users/health
echo
curl -fsS http://localhost:8081/products/health
echo
curl -fsS http://localhost:8081/orders/health
echo
curl -fsS http://localhost:8081/products
echo
