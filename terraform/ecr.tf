locals {
  repos = toset([
    "ecommerce/frontend",
    "ecommerce/api-gateway",
    "ecommerce/user-service",
    "ecommerce/product-service",
    "ecommerce/order-service"
  ])
}
resource "aws_ecr_repository" "repo" {
  for_each = local.repos
  name = each.value
  image_scanning_configuration { scan_on_push = true }
}
