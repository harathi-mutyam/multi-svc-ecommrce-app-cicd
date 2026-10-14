output "cluster_name" {
  description = "Name of the EKS cluster"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "Endpoint of the EKS cluster"
  value       = module.eks.cluster_endpoint
}

output "ecr_urls" {
  description = "URLs of the five ECR repositories"

  value = {
    for k, v in aws_ecr_repository.repo :
    k => v.repository_url
  }
}
