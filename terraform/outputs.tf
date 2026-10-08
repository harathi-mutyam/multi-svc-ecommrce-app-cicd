output "cluster_name" { value = module.eks.cluster_name }
output "cluster_endpoint" { value = module.eks.cluster_endpoint }
output "ecr_urls" { value = {for k,v in aws_ecr_repository.repo : k => v.repository_url} }
