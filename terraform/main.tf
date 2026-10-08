data "aws_availability_zones" "available" {}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = "ecommerce-vpc"
  cidr = "10.30.0.0/16"

  azs             = slice(data.aws_availability_zones.available.names, 0, 2)
  private_subnets = ["10.30.1.0/24", "10.30.2.0/24"]
  public_subnets  = ["10.30.101.0/24", "10.30.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
  enable_dns_hostnames = true

  public_subnet_tags = {"kubernetes.io/role/elb" = 1}
  private_subnet_tags = {"kubernetes.io/role/internal-elb" = 1}
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name = var.cluster_name
  kubernetes_version = "1.33"
  endpoint_public_access = true

  addons = {
    coredns = {}
    kube-proxy = {}
    vpc-cni = {}
    eks-pod-identity-agent = {}
    aws-ebs-csi-driver = {}
  }

  vpc_id = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
  enable_cluster_creator_admin_permissions = true

  eks_managed_node_groups = {
    main = {
      instance_types = ["t3.large"]
      min_size = 2
      desired_size = 2
      max_size = 3
    }
  }
}
