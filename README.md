# CloudCart - E-Commerce Microservices CI/CD (Kubernetes Manifests Edition)

This edition uses **plain Kubernetes YAML manifests** instead of a Helm chart.

## Application architecture

Internet -> React/Nginx Frontend -> Nginx API Gateway ->
- User Service -> PostgreSQL
- Product Service -> PostgreSQL
- Order Service -> PostgreSQL

## GitOps

GitHub Actions builds and pushes Docker images to ECR, then updates the image tags directly in `k8s/*.yaml`.

Argo CD watches:

```text
path: k8s
```

and automatically syncs the manifests to EKS.

## Kubernetes manifests

```text
k8s/
├── 00-namespace.yaml
├── 01-db-secret.yaml
├── 02-user-db.yaml
├── 03-product-db.yaml
├── 04-order-db.yaml
├── 05-user-service.yaml
├── 06-product-service.yaml
├── 07-order-service.yaml
├── 08-api-gateway.yaml
├── 09-frontend.yaml
└── 10-servicemonitors.yaml
```

## Manual deployment

After replacing `REPLACE_ECR` with your AWS ECR registry:

```bash
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-db-secret.yaml
kubectl apply -f k8s/02-user-db.yaml
kubectl apply -f k8s/03-product-db.yaml
kubectl apply -f k8s/04-order-db.yaml
kubectl apply -f k8s/05-user-service.yaml
kubectl apply -f k8s/06-product-service.yaml
kubectl apply -f k8s/07-order-service.yaml
kubectl apply -f k8s/08-api-gateway.yaml
kubectl apply -f k8s/09-frontend.yaml
```

Install Prometheus Operator before applying `10-servicemonitors.yaml`.

Or deploy all non-ServiceMonitor manifests first and let Argo CD manage the directory after monitoring CRDs exist.
