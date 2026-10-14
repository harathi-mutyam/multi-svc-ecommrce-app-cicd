# Ecommerce Microservices — AWS EKS CI/CD, GitOps, Monitoring & Cleanup

> **Project notes** — reformatted from the supplied walkthrough. Commands and configurations are retained as provided; they have not been independently validated.

**Repository:** `harathi-mutyam/multi-svc-ecommrce-app-cicd`  
**Region:** `eu-north-1`  
**Infrastructure:** EC2 runner + management server, EKS, ECR, Terraform  
**Delivery:** GitHub Actions, SonarQube, Trivy, Argo CD  
**Observability:** Prometheus, Grafana, Alertmanager, Loki, Alloy

## Contents

- EC2 setup and tooling (Steps 1–22)
- Terraform, ECR and EKS (Steps 24–30)
- CI/CD and Argo CD (Steps 31–34)
- Monitoring and dashboards (Steps 35–44)
- Loki and Alloy logging (Steps 45–47)
- Argo CD access (Step 48)
- AWS cleanup (Step 60)

---

Start with these two EC2 instances
EC2 1 — ecomm-runner
m7i-flex.large · Ubuntu 24.04 · 50 GiB gp3
EC2 2 — ecomm-server
t3.small · Ubuntu 24.04 · 30 GiB gp3


Server	Instance type	Purpose
ecomm-runner	m7i-flex.large	GitHub Runner, SonarQube, Docker, Trivy
ecomm-server	t3.small	Terraform, AWS CLI, kubectl, Helm
EKS	2 × c7i-flex.large	Kubernetes application workloads


## EC2 setup and tooling


### Step 1 — Launch the two EC2 instances

**WHERE:** AWS Console → EC2 → Launch instances
Use Ubuntu Server 24.04 LTS, your existing ecommerce-key key pair, and the default VPC.
For ecomm-runner, select m7i-flex.large with 50 GiB gp3 storage.
For ecomm-server, select t3.small with 30 GiB gp3 storage.
Attach ecommerce-sg to both instances. Configure inbound SSH port 22 from My IP, and SonarQube port 9000 from My IP. Only open ports 8080 and 8081 from My IP if you plan to test the application directly on an EC2 instance.
Do not launch EKS worker nodes manually; Terraform will manage them later.

### Step 2 — Connect to Runner EC2

**WHERE:** Windows Git Bash
ssh -i ~/Downloads/ecommerce-key.pem ubuntu@<RUNNER_PUBLIC_IP>
Set the hostname:
sudo hostnamectl set-hostname ecommerce-runner
exec bash
Update and install prerequisites:
sudo apt update
sudo apt upgrade -y

sudo apt install -y \
  git curl wget unzip jq gnupg \
  ca-certificates python3 python3-pip python3-venv
**Verify:**
hostname
git --version
python3 --version



### Step 3 — Install Docker on Runner EC2

**WHERE:** RUNNER EC2
sudo install -m 0755 -d /etc/apt/keyrings

sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc

sudo chmod a+r /etc/apt/keyrings/docker.asc
Add the Docker repository:
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
Install Docker:
sudo apt update

sudo apt install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
Log out and reconnect to activate Docker group membership:
exit
exit
Reconnect from Windows Git Bash:
ssh -i ~/Downloads/ecommerce-key.pem ubuntu@<RUNNER_PUBLIC_IP>
**Verify:**
docker --version
docker compose version
docker ps
docker run --rm hello-world

### Step 4 — Configure SonarQube requirements

**WHERE:** RUNNER EC2
echo "vm.max_map_count=524288" | sudo tee /etc/sysctl.d/99-sonarqube.conf

echo "fs.file-max=131072" | sudo tee -a /etc/sysctl.d/99-sonarqube.conf

sudo sysctl --system
**Verify:**
sysctl vm.max_map_count
sysctl fs.file-max

### Step 5 — Install SonarQube on the same Runner EC2

**WHERE:** RUNNER EC2
Create persistent Docker volumes:
docker volume create sonarqube_data
docker volume create sonarqube_extensions
docker volume create sonarqube_logs
Start SonarQube:
docker run -d \
  --name sonarqube \
  --restart unless-stopped \
  -p 9000:9000 \
  -v sonarqube_data:/opt/sonarqube/data \
  -v sonarqube_extensions:/opt/sonarqube/extensions \
  -v sonarqube_logs:/opt/sonarqube/logs \
  sonarqube:lts-community
Check the container:
docker ps
docker logs --tail=100 sonarqube
Wait for SonarQube to initialize, then test:
curl http://localhost:9000/api/system/status
Expected response contains:
{"status":"UP"}
Open SonarQube in your Windows browser:
http://<RUNNER_PUBLIC_IP>:9000
Complete the initial login with username: admin password: admin and password-change to admin123 process.

### Step 6 — Connect to Management Server

**WHERE:** Another Windows Git Bash terminal
ssh -i ~/Downloads/ecommerce-key.pem ubuntu@<SERVER_PUBLIC_IP>
Set the hostname and install basic tools:
sudo hostnamectl set-hostname ecommerce-server
exec bash

sudo apt update
sudo apt upgrade -y

sudo apt install -y \
  git curl wget unzip gnupg ca-certificates
Clone your existing repository:
cd ~

git clone https://github.com/harathi-mutyam/multi-svc-ecommrce-app-cicd.git

cd multi-svc-ecommrce-app-cicd

ls -la
Check the project files:
ls .github/workflows
ls terraform
ls k8s

cd terraform
vim main.tf
Replace node group section with this content#
eks_managed_node_groups = {
    main = {
      instance_types = ["c7i-flex.large"]
      min_size = 1
      desired_size = 1
      max_size = 2
    }

We will use your existing repository and avoid unnecessarily changing the CI/CD workflow.

### Step 7 — Verify the existing AWS resources

Before Terraform installation and EKS creation, we need to confirm what remains from your earlier deployment.
**WHERE:** AWS Console
Check EC2 → Instances, EKS → Clusters, and ECR → Private repositories in eu-north-1.
Do not delete any existing ECR repositories or run terraform destroy during this setup.

### Step 8 — Install AWS CLI on Management Server

**WHERE:** ecomm-server EC2
cd ~

curl -fsSL \
  https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip \
  -o awscliv2.zip

unzip awscliv2.zip

sudo ./aws/install
**Verify:**
aws --version
For AWS authentication, an EC2 IAM role with appropriate permissions is preferable to storing long-lived access keys. If you have already attached an IAM role, test:
aws sts get-caller-identity
Otherwise, configure your authorized AWS CLI credentials securely using your existing IAM setup. Do not share your access keys here.
Set the region:
aws configure set region eu-north-1
aws configure
**Verify:**
aws sts get-caller-identity
aws configure get region
Your AWS account ID should match the account where you are deploying the project.

### Step 9 — Check remaining AWS infrastructure

**WHERE:** ecomm-server EC2
Check existing EKS clusters:
aws eks list-clusters \
  --region eu-north-1
Check ECR repositories:
aws ecr describe-repositories \
  --region eu-north-1 \
  --query 'repositories[].repositoryName' \
  --output table
Check running EC2 instances:
aws ec2 describe-instances \
  --region eu-north-1 \
  --filters "Name=instance-state-name,Values=pending,running" \
  --query 'Reservations[].Instances[].[InstanceId,InstanceType,State.Name]' \
  --output table
These commands are read-only.

### Step 10 — Install Terraform

**WHERE:** ecomm-server EC2
sudo apt update

sudo apt install -y \
  gnupg \
  software-properties-common \
  curl \
  wget
Add the HashiCorp signing key:
wget -O- https://apt.releases.hashicorp.com/gpg \
  | gpg --dearmor \
  | sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg >/dev/null
Add the repository:
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/hashicorp.list
Install Terraform:
sudo apt update
sudo apt install -y terraform
**Verify:**
terraform version

### Step 11 — Install kubectl

**WHERE:** ecomm-server EC2
Install a kubectl release compatible with your intended EKS Kubernetes version. For the Kubernetes 1.36 configuration in your notes:
curl -LO \
  https://dl.k8s.io/release/v1.36.0/bin/linux/amd64/kubectl

curl -LO \
  https://dl.k8s.io/release/v1.36.0/bin/linux/amd64/kubectl.sha256

echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check

sudo install -o root -g root -m 0755 \
  kubectl /usr/local/bin/kubectl
**Verify:**
kubectl version --client
Before creating EKS, we will confirm that the selected Kubernetes version is supported in your AWS region.

### Step 12 — Install Helm

**WHERE:** ecomm-server EC2
curl -fsSL -o get_helm.sh \
  https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
Review the script:
less get_helm.sh
Press q to exit.
Install:
chmod 700 get_helm.sh
./get_helm.sh
**Verify:**
helm version

### Step 13 — Verify all Management Server installations

**WHERE:** ecomm-server EC2
echo "===== AWS CLI ====="
aws --version

echo "===== AWS Identity ====="
aws sts get-caller-identity

echo "===== Terraform ====="
terraform version

echo "===== kubectl ====="
kubectl version --client

echo "===== Helm ====="
helm version

echo "===== Repository ====="
ls ~/multi-svc-ecommrce-app-cicd/terraform

### Step 14 — Check Runner and SonarQube

**WHERE:** ecomm-runner EC2
hostname

docker --version

docker ps

curl http://localhost:9000/api/system/status

free -h
Expected SonarQube status:
{"status":"UP"}


### Step 15 — Create the SonarQube project

**WHERE:** Windows browser
Open:
http://<RUNNER_PUBLIC_IP>:9000
Log in to SonarQube.
Navigate to:
Projects → Create Project → Local Project
Enter:
Field	Value
Project display name	Ecommerce-Cart-Microservices
Project key	ecommerce-microservices-demo
Main branch	main
Click Set Up.
When prompted for the analysis method, select GitHub Actions.

### Step 16 — Generate SonarQube token

**WHERE:** SonarQube browser
Generate an analysis token for the project.
Suggested token name:
ecommerce-github-actions
Copy the generated token.
Now open your GitHub repository:
harathi-mutyam/multi-svc-ecommrce-app-cicd
Navigate to:
Settings → Secrets and variables → Actions → Secrets → New repository secret
Create:
Name	Value
SONAR_TOKEN	Your generated SonarQube token
Then go to Variables → New repository variable.
Create:
Name	Value
SONAR_HOST_URL	http://localhost:9000
Because GitHub Actions Runner and SonarQube are running on the same EC2, the runner can access SonarQube through localhost:9000.

### Step 17 — Install Node.js on Runner EC2

**WHERE:** ecomm-runner EC2
Install Node.js for the frontend build and CI/CD validation.
sudo apt update

sudo apt install -y nodejs npm
**Verify:**
node --version
npm --version
Check your repository's frontend package.json for the required Node.js version. If the installed version is too old, install a compatible supported LTS release before running the pipeline.

### Step 18 — Install Trivy on Runner EC2

**WHERE:** ecomm-runner EC2
Trivy scans Docker images for known vulnerabilities.
Install prerequisites:
sudo apt install -y wget apt-transport-https gnupg
Add the Trivy signing key:
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key \
  | gpg --dearmor \
  | sudo tee /usr/share/keyrings/trivy.gpg >/dev/null
Add the Trivy repository:
echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb generic main" \
  | sudo tee /etc/apt/sources.list.d/trivy.list
Install:
sudo apt update

sudo apt install -y trivy
**Verify:**
trivy --version

### Step 19 — Install AWS CLI on Runner EC2

**WHERE:** ecomm-runner EC2
cd ~

curl -fsSL \
  https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip \
  -o awscliv2.zip

unzip awscliv2.zip

sudo ./aws/install
**Verify:**
aws --version
For AWS access, preferably attach a dedicated IAM instance profile to ecomm-runner with only the permissions required for ECR image pushes and your CI/CD workflow.
Then verify:
aws sts get-caller-identity
Set the region:
aws configure set region eu-north-1

aws configure
**Verify:**
aws configure get region
Do not place AWS access keys directly in workflow files or commit them to GitHub.

### Step 20 — Register GitHub Self-Hosted Runner

**WHERE:** GitHub browser
Open your repository:
GitHub Ecommerce Project
Navigate to:
Settings → Actions → Runners → New self-hosted runner
Select:
•	Operating system: Linux
•	Architecture: x64
GitHub will display installation commands.
**WHERE:** ecomm-runner EC2
Create the runner directory:
cd ~

mkdir -p actions-runner

cd actions-runner
Copy the current download and extraction commands directly from GitHub and execute them here. Do not reuse old runner download URLs or registration tokens.
Next, copy the configuration command displayed by GitHub.
During configuration, use:
Prompt	Value
Runner group	Press Enter
Runner name	ecommerce-runner
Additional labels	ecommerce-runner,docker,aws,trivy
Work folder	Press Enter
Install the runner as a service:
cd ~/actions-runner

sudo ./svc.sh install

sudo ./svc.sh start

sudo ./svc.sh status
Expected status:
Active: active (running)
Do not start ./run.sh separately when the runner is already running as a service.

### Step 21 — Verify GitHub Runner

**WHERE:** GitHub browser
Navigate to:
Repository → Settings → Actions → Runners
You should see:
Runner	Status
ecommerce-runner	Idle
If the runner appears Offline, check:
cd ~/actions-runner

sudo ./svc.sh status

### Step 22 — Verify Runner and SonarQube connectivity

**WHERE:** ecomm-runner EC2
curl http://localhost:9000/api/system/status
Expected response includes:
{"status":"UP"}
Check the installed tools:
echo "===== Git ====="
git --version

echo "===== Docker ====="
docker --version

echo "===== Node.js ====="
node --version

echo "===== Trivy ====="
trivy --version

echo "===== AWS CLI ====="
aws --version

echo "===== SonarQube ====="
curl -s http://localhost:9000/api/system/status

echo "===== Runner ====="
cd ~/actions-runner
sudo ./svc.sh status


 Use Terraform to create all five Amazon ECR repositories.
Use the same Terraform deployment to create the VPC, subnets, NAT Gateway, EKS cluster, worker nodes, IAM roles and EKS add-ons.
Verify the infrastructure and ECR repositories.
Later, inspect your existing GitHub Actions ci-cd.yml and configure the pipeline to build and push Docker images to ECR.
Continue with Argo CD, Prometheus, Grafana, Alertmanager, Loki and Alloy.

## Terraform, ECR and EKS


### Step 24 — Prepare Terraform on Server EC2

**WHERE:** ecomm-server EC2
Connect to your server and navigate to the repository:
cd ~/multi-svc-ecommrce-app-cicd
cd terraform
ls -lah
Verify AWS authentication:
aws configure get region
terraform version
Your AWS region should be eu-north-1.
Before modifying Terraform, check the existing state and resources:
terraform init

terraform state list

aws eks list-clusters --region eu-north-1

aws ecr describe-repositories \
  --region eu-north-1 \
  --query 'repositories[].repositoryName' \
  --output table
If an existing ecommerce-cluster or ECR repository is not tracked by your Terraform state, reconcile or import it before applying. Otherwise, Terraform may fail with an already-exists error.

### Step 25 — Create ECR repositories using Terraform

**WHERE:** ecomm-server → terraform/
Create a new file:
vim ecr.tf
Paste:
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

  name                 = each.value
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Project   = "ecommerce"
    ManagedBy = "Terraform"
  }
}

Save with esc :wq!
Create an output file:
vim ecr-outputs.tf

Paste:
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

Save the file.
Change main.tf file content with below content
vim main.tf

data "aws_availability_zones" "available" {}

# =====================================
# VPC CONFIGURATION
# =====================================

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = "ecommerce-vpc"
  cidr = "10.30.0.0/16"

  azs = slice(
    data.aws_availability_zones.available.names,
    0,
    2
  )

  private_subnets = [
    "10.30.1.0/24",
    "10.30.2.0/24"
  ]

  public_subnets = [
    "10.30.101.0/24",
    "10.30.102.0/24"
  ]

  enable_nat_gateway   = true
  single_nat_gateway   = true
  enable_dns_hostnames = true

  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }
}

# =====================================
# EKS CLUSTER CONFIGURATION
# =====================================

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = var.cluster_name
  kubernetes_version = "1.33"

  endpoint_public_access = true

  # ===================================
  # EKS ADD-ONS
  # ===================================

  addons = {
    coredns = {}

    kube-proxy = {}

    vpc-cni = {
      before_compute = true
    }

    eks-pod-identity-agent = {}

    aws-ebs-csi-driver = {}
  }

  # ===================================
  # VPC CONNECTION
  # ===================================

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  enable_cluster_creator_admin_permissions = true

  # ===================================
  # EKS WORKER NODES
  # ===================================

  eks_managed_node_groups = {
    main = {
      instance_types = ["c7i-flex.large"]

      min_size     = 1
      desired_size = 1
      max_size     = 2

      capacity_type = "ON_DEMAND"
    }
  }
}

These resources use the AWS provider configuration already present in your Terraform project. Ensure that provider targets eu-north-1.

Push changes to github
git log -1 --oneline
cd ..
cd multi-svc-ecommrce-app-cicd

set git username and git email id
git config --global user.name harathi-mutyam
git config --global user.email ehmutyam@gmail.com
git pull origin main
git add terraform/main.tf terraform/ecr.tf terraform/outputs.tf
git commit -m "changed tf files"
provide git username
git password: <paste github token >

get the git hub token using below procedure
Create GitHub Personal Access Token (PAT)
Open github in browser→ select your project repository→
Profile Picture →Settings  → Developer  Settings  →Personal Access Tokens  → Tokens (classic)→
Generate new token (classic)
Token configuration:
Setting	Value
Note	Ecommerce EC2 Git Push
Expiration	30 days or as required
Scope	Select repo
Additional scope	Select workflow, if updating workflow files

Click on generate  → save the personal_access_token at somewhere


### Step 26 — Verify your existing EKS Terraform configuration

aws iam list-attached-user-policies   --user-name harathi1203
expected policy
arn:aws:iam::aws:policy/AdministratorAccess


### Step 27 — Terraform initialization and validation

Run on ecomm-server:
cd ~/multi-svc-ecommrce-app-cicd/terraform

terraform fmt -recursive

terraform init

terraform validate
Expected validation result:Success! The configuration is valid.
Now create the Terraform plan:
terraform plan -out=ecommerce.tfplan
Review it:
terraform show ecommerce.tfplan
terraform apply ecommerce.tfplan
if failed do the following changes

### Step 28 — Create a Terraform file for the EBS CSI IAM role

vim ebs-csi-iam.tf
data "aws_iam_policy_document" "ebs_csi_assume_role" {
  statement {
    effect = "Allow"

    actions = [
      "sts:AssumeRole",
      "sts:TagSession"
    ]

    principals {
      type = "Service"

      identifiers = [
        "pods.eks.amazonaws.com"
      ]
    }
  }
}

resource "aws_iam_role" "ebs_csi" {
  name = "ecommerce-ebs-csi-role"

  assume_role_policy = data.aws_iam_policy_document.ebs_csi_assume_role.json

  tags = {
    Project   = "ecommerce"
    ManagedBy = "Terraform"
  }
}

resource "aws_iam_role_policy_attachment" "ebs_csi" {
  role = aws_iam_role.ebs_csi.name

  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

Save the file
Modify the EKS add-on configuration
vim main.tf
Find the existing section:
aws-ebs-csi-driver = {}
Replace it with:
aws-ebs-csi-driver = {
  pod_identity_association = [{
    role_arn        = aws_iam_role.ebs_csi.arn
    service_account = "ebs-csi-controller-sa"
  }]
}
Initialize and validate Terraform
terraform fmt -recursive
terraform init
terraform validate
terraform plan -out=ebs-fix.tfplan
terraform apply ebs-fix.tfplan
after all resources created check
Verify the EBS CSI driver
aws eks describe-addon \
  --cluster-name ecommerce-cluster \
  --addon-name aws-ebs-csi-driver \
  --region eu-north-1 \
  --query 'addon.{Status:status,Health:health.issues,PodIdentity:podIdentityAssociations}' \
  --output json
Expected status: Active
kubectl get pods -n kube-system | grep ebs
All EBS CSI controller and node containers should eventually show Running and be ready.
kubectl get nodes
**Expected:** STATUS must be Ready




### Step 29 — Verify ECR repositories

aws ecr describe-repositories \
  --region eu-north-1 \
  --query 'repositories[].repositoryName' \
  --output table
Expected repository names:
ecommerce/frontend ,ecommerce/api-gateway ,ecommerce/user-service,ecommerce/product-service
ecommerce/order-service
Display their URLs:
terraform output ecr_repository_urls
At this stage, the ECR repositories can be empty. Your CI/CD workflow will push images later.

### Step 30 — Verify EKS infrastructure

Check the cluster:
aws eks describe-cluster \
  --name ecommerce-cluster \
  --region eu-north-1 \
  --query 'cluster.[name,status,version]' \
  --output table

Configure Kubernetes access:
aws eks update-kubeconfig \
  --region eu-north-1 \
  --name ecommerce-cluster
Check the worker nodes:
kubectl get nodes -o wide
Check the add-ons:
aws eks list-addons \
  --cluster-name ecommerce-cluster \
  --region eu-north-1
Push the changes to github from ec2
cd ..
git status
git pull orgin main
git add terraform/main.tf terraform/variables.tf  terraform/versions.tf  terraform/ebs-csi-iam.tf
git commit -m "added ebs-csi-iam.tf"
git push origin main
ubuntu@ecommerce-server:~/multi-svc-ecommrce-app-cicd$ cd terraform
terraform output cluster_name
"ecommerce-cluster"
terraform output ecr_urls
{
  "ecommerce/api-gateway" = "263860684319.dkr.ecr.eu-north-1.amazonaws.com/ecommerce/api-gateway"
  "ecommerce/frontend" = "263860684319.dkr.ecr.eu-north-1.amazonaws.com/ecommerce/frontend"
  "ecommerce/order-service" = "263860684319.dkr.ecr.eu-north-1.amazonaws.com/ecommerce/order-service"
  "ecommerce/product-service" = "263860684319.dkr.ecr.eu-north-1.amazonaws.com/ecommerce/product-service"
  "ecommerce/user-service" = "263860684319.dkr.ecr.eu-north-1.amazonaws.com/ecommerce/user-service"
}
aws eks update-kubeconfig \
  --region eu-north-1 \
  --name ecommerce-cluster
kubectl get nodes -o wide
Node must be Ready
kubectl get pods -A
all pods must be in running state
kubectl get storageclass
NAME   PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
gp2    kubernetes.io/aws-ebs   Delete          WaitForFirstConsumer   false                  68m
aws eks list-addons \
  --cluster-name ecommerce-cluster \
  --region eu-north-1

aws eks describe-addon \
  --cluster-name ecommerce-cluster \
  --addon-name aws-ebs-csi-driver \
  --region eu-north-1 \
  --query 'addon.{Status:status,Health:health.issues,PodIdentity:podIdentityAssociations}' \
  --output json
    "Status": "ACTIVE"
aws ecr describe-repositories \
  --region eu-north-1 \
  --query 'repositories[].repositoryName' \
  --output table



## CI/CD and Argo CD


### Step 31 — Inspect your existing CI/CD and Kubernetes files

cd .. or
cd ~/multi-svc-ecommrce-app-cicd
git status
find .github/workflows -maxdepth 2 -type f
find k8s -maxdepth 3 -type f
find . -name Dockerfile -not -path './.git/*'
cat .github/workflows/*.yml
grep -Rn 'image:' k8s/
Open workflow cicd yaml file
vim .github/workflows/ci-cd.yml
add this
concurrency:
  group: ecommerce-${{ github.ref }}
  cancel-in-progress: true

Place it after permissions:

### Step 33 — Configure GitHub Actions secrets and variables

Open Your GitHub repository→ Settings → Secrets and variables → Actions
Under Repository secrets, verify:
Secret	Purpose
AWS_ACCESS_KEY_ID	IAM user access key
AWS_SECRET_ACCESS_KEY	IAM user secret key
SONAR_TOKEN	SonarQube analysis token

Repository variables, configure
Variable	Value
AWS_REGION	eu-north-1
ECR_REGISTRY	263860684319.dkr.ecr.eu-north-1.amazonaws.com
SONAR_HOST_URL	http://localhost:9000
**Note:** localhost:9000 works because SonarQube and the self-hosted runner are on the same EC2 instance.


### Step 32 — Verify your GitHub Actions runner before executing cicd

**WHERE:** ecomm-runner EC2
cd ~/actions-runner
sudo ./svc.sh status
curl -s http://localhost:9000/api/system/status
docker --version
docker info
trivy --version
node --version
npm --version
python3 --version
aws sts get-caller-identity




docker info
Your GitHub runner must also appear as Idle under:
GitHub → Repository → Settings → Actions → Runners.

### Step 33 — Test the pipeline

Open server gitbash terminal
cd ~/multi-svc-ecommrce-app-cicd

find services -name requirements.txt

find services -name 'test_*.py'

find frontend -maxdepth 2 -name package.json
git status
git pull origin main
git add .github/workflows/ci-cd.yml
git commit -m "chnages in ci-cd.yml file"
git push origin main

open browser→open project repository in github → Actions→click on E-commerce Microservices CICD →You can observe  pipeline is running now
After a successful run, verify images in ECR:
open aws console login—> ecr→ check the changes
Or run the below command in server ec2 gitbash terminal
aws ecr describe-images   --repository-name ecommerce/frontend   --region eu-north-1   --query 'imageDetails[].imageTags'

git pull origin main
git log -3 --oneline

Output will be
ci: update Kubernetes images <commit-sha>

CD Part:

### Step 34 — Install Argo CD

Open server gitbash terminal
kubectl create namespace argocd
kubectl apply \
  --server-side \
  --force-conflicts \
  -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

kubectl get pods -n argocd
Wait until all required Argo CD components are ready.





## Monitoring and dashboards


### Step 35 — Install Prometheus Operator

Before install Prometheus increase worker nodes using Terraform
cd ~/multi-svc-ecommrce-app-cicd/terraform
vim main.tf
Change only desired_size from 1 to 2:
eks_managed_node_groups = {
  main = {
    instance_types = ["c7i-flex.large"]

    min_size     = 1
    desired_size = 2
    max_size     = 2

    capacity_type = "ON_DEMAND"
  }
}
Save the file
terraform fmt
terraform validate
terraform plan -out=scale.tfplan
terraform show scale.tfplan
terraform apply scale.tfplan

if not reflected Debugging procedure
optional way

kubectl get nodes
aws eks list-nodegroups \
  --cluster-name ecommerce-cluster \
  --region eu-north-1

Verify your main.tf configuration
cd ~/multi-svc-ecommrce-app-cicd/terraform

grep -A 12 'eks_managed_node_groups' main.tf

Check whether you have:
min_size     = 1
desired_size = 2
max_size     = 2
kubectl get nodes -o wide
If you see two nodes with Ready status, no scaling action is needed.Find AWS node-group name
aws eks list-nodegroups \
  --cluster-name ecommerce-cluster \
  --region eu-north-1
Check AWS scaling configuration
NODEGROUP=$(aws eks list-nodegroups \
  --cluster-name ecommerce-cluster \
  --region eu-north-1 \
  --query 'nodegroups[0]' \
  --output text)

echo "$NODEGROUP"
Check its scaling configuration:
aws eks describe-nodegroup \
  --cluster-name ecommerce-cluster \
  --nodegroup-name "$NODEGROUP" \
  --region eu-north-1 \
  --query 'nodegroup.{Status:status,Scaling:scalingConfig,Health:health.issues}' \
  --output json
If AWS reports desiredSize: 2, wait for the second node to join and check its status.
If AWS reports desiredSize: 1, Terraform has not changed the actual desired capacity.
Scale to two nodes if AWS still reports one
If the node group is ACTIVE, healthy, and AWS reports desiredSize: 1, you can update its scaling configuration directly:
aws eks update-nodegroup-config \
  --cluster-name ecommerce-cluster \
  --nodegroup-name "$NODEGROUP" \
  --region eu-north-1 \
  --scaling-config minSize=1,maxSize=2,desiredSize=2

aws eks describe-nodegroup \
  --cluster-name ecommerce-cluster \
  --nodegroup-name "$NODEGROUP" \
  --region eu-north-1 \
  --query 'nodegroup.health.issues'

kubectl get nodes -w
Press Ctrl+C after both nodes become Ready.
kubectl get nodes
Worker node	Status	Instance type
ip-10-30-1-27	Ready	c7i-flex.large
ip-10-30-2-4	Ready	c7i-flex.large


If both nodes are ready install Prometheus

### Step 36 — Add the Prometheus Helm repository

helm repo add prometheus-community \
  https://prometheus-community.github.io/helm-charts

helm repo update

kubectl create namespace monitoring


### Step 37 — Create resource-optimized Helm values

Because you have only 8 GiB total worker memory, I recommend using a lightweight monitoring configuration.
cd ~/multi-svc-ecommrce-app-cicd
mkdir -p monitoring
vim monitoring/prometheus-values.yaml
prometheus:
  prometheusSpec:
    retention: 2d
    replicas: 1

    resources:
      requests:
        cpu: 100m
        memory: 300Mi
      limits:
        cpu: 500m
        memory: 1Gi

    serviceMonitorSelectorNilUsesHelmValues: false
    serviceMonitorNamespaceSelector: {}

grafana:
  enabled: true

  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 300m
      memory: 512Mi

alertmanager:
  enabled: true

  alertmanagerSpec:
    resources:
      requests:
        cpu: 50m
        memory: 100Mi
      limits:
        cpu: 200m
        memory: 256Mi

prometheusOperator:
  resources:
    requests:
      cpu: 50m
      memory: 100Mi
    limits:
      cpu: 200m
      memory: 256Mi
These settings reduce the resource requests for the main monitoring components. They do not eliminate the additional resources used by exporters and other monitoring pods.
The namespace selector allows Prometheus to discover your existing ServiceMonitors in the ecommerce namespace.
Install the monitoring stack
helm install kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  -n monitoring \
  -f monitoring/prometheus-values.yaml \
  --wait \
  --timeout 10m
NAME: kube-prometheus-stack
LAST DEPLOYED: Wed Oct 14 14:21:59 2026
NAMESPACE: monitoring
STATUS: deployed
REVISION: 1
NOTES:
kube-prometheus-stack has been installed. Check its status by running:
  kubectl --namespace monitoring get pods -l "release=kube-prometheus-stack"

Get Grafana 'admin' user password by running:

  kubectl --namespace monitoring get secrets kube-prometheus-stack-grafana -o jsonpath="{.data.admin-password}" | base64 -d ; echo

Access Grafana local instance:

  export POD_NAME=$(kubectl --namespace monitoring get pod -l "app.kubernetes.io/name=grafana,app.kubernetes.io/instance=kube-prometheus-stack" -oname)
  kubectl --namespace monitoring port-forward $POD_NAME 3000

Get your grafana admin user password by running:

  kubectl get secret --namespace monitoring -l app.kubernetes.io/component=admin-secret -o jsonpath="{.items[0].data.admin-password}" | base64 --decode ; echo


Visit https://github.com/prometheus-operator/kube-prometheus for instructions on how to create & configure Alertmanager and Prometheus instances using the Operator.


kubectl get pods -n monitoring

kubectl get crd servicemonitors.monitoring.coreos.com

kubectl get svc -n monitoring



### Step 38 — Get Grafana login credentials

kubectl get secret kube-prometheus-stack-grafana \
  -n monitoring \
  -o jsonpath="{.data.admin-password}" | base64 -d
echo

Grafana username and passwords are
Username: admin password: copy it & save it.
Add port number 3000 in security group:
Open aws console→ec2→security group→ select eccomerce-sg→add in bound rule→
Cutom TCP port range: 3000  Source: My IP →save it


Access Grafana securely from your Windows browser
Grafana service uses ClusterIP, it is not directly accessible from the internet.
kubectl port-forward \
  -n monitoring \
  svc/kube-prometheus-stack-grafana \
  3000:80 \
  --address=0.0.0.0

Check it in browser using
http://ecommerce-server-publicip:3000


Or use another way also secured way
kubectl port-forward \
  -n monitoring \
  svc/kube-prometheus-stack-grafana \
  3000:80
Leave this terminal running. It will display forwarding messages.
Next, open a new Windows Git Bash terminal and create an SSH tunnel:
ssh -i ~/Downloads/ecommerce-key.pem \
  -L 3000:localhost:3000 \
  ubuntu@<Ecommerc-SERVER_PUBLIC_IP>
Check it in browser using
http://localhost:3000



### Step 39 — Access Prometheus in ecommerce server gitbash terminal


kubectl port-forward \
  -n monitoring \
  svc/kube-prometheus-stack-prometheus \
  9090:9090 \
  --address=0.0.0.0

You will see Forwarding from 0.0.0.0:9090 -> 9090
Handling connection for 9090
Handling connection for 9090
Handling connection for 9090



Add 9090 inbound rile in ecommerce-sg  for Prometheus purpose
Cutom TCP port range: 9090  Source: My IP →save it
Open browser→http://ecomerce-server-publicip:9090
After that In Prometheus, navigate to Status → Target health to inspect scrape targets. The exact menu wording may vary by version.
Optional steps: I edited content above
But here I got error to fix that error do the below procedure
Debugging procedure
Open one more ecommerce-server gitbash terminal
Login using ssh command
ssh -i Downloads/ecommerce-key.pem ubuntu@<publicip of server>
cd ~/multi-svc-ecommrce-app-cicd
cat monitoring/prometheus-values.yaml
vim monitoring/prometheus-values.yaml
prometheus:
  prometheusSpec:
    retention: 2d
    replicas: 1

    resources:
      requests:
        cpu: 100m
        memory: 300Mi
      limits:
        cpu: 500m
        memory: 1Gi

    serviceMonitorSelectorNilUsesHelmValues: false
    serviceMonitorNamespaceSelector: {}

grafana:
  enabled: true

  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 300m
      memory: 512Mi

alertmanager:
  enabled: true

  alertmanagerSpec:
    resources:
      requests:
        cpu: 50m
        memory: 100Mi
      limits:
        cpu: 200m
        memory: 256Mi

prometheusOperator:
  resources:
    requests:
      cpu: 50m
      memory: 100Mi
    limits:
      cpu: 200m
      memory: 256Mi
save the file
Only one configuration has changed:
 serviceMonitorNamespaceSelector: {}

This permits ServiceMonitor discovery across namespaces, including monitoring and ecommerce.
Upgrade Prometheus
helm upgrade kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  -n monitoring \
  -f monitoring/prometheus-values.yaml \
  --wait \
  --timeout 10m
Helm result: STATUS: deployed
Verify ServiceMonitors
kubectl get servicemonitors -A

kubectl get prometheus -n monitoring \
  -o yaml | grep -A 15 serviceMonitorSelector

Open browser→ http://publicip of ecommerce server :9090→status→target health
If you seen this page

Click query → enter up → click on execute


### Step 40 — Verify the Prometheus data source in Grafana

Your previous Prometheus screenshot showed “No scrape pools found.” We should resolve that before creating dashboards.
Check the Prometheus data source
Optional command here Restart Grafana port-forwarding
kubectl port-forward \
  -n monitoring \
  svc/kube-prometheus-stack-grafana \
  3000:80 \
  --address=0.0.0.0

Verify Grafana locally
Open another terminal connected to ecomm-server:
curl -I http://localhost:3000/login

open Grafana browser→
enter login details username : admin and password: saved Grafana password here
Connections (in the left sidebar)→ Data sources → Prometheus → click Test

If the connection succeeds again, return to Explore and run
Click on Explore(in the left sidebar )→ here  type: up→   click on this symbol
Verify your Ecommerce ServiceMonitors before start Argo CD
In our existing k8s/10-servicemonitors.yaml defines monitors for the user, product and order services.
The required CRD is now installed, so you can deploy these resources once their corresponding Kubernetes Services exist.
kubectl get servicemonitors -A
Then verify your existing Ecommerce Services:
kubectl get svc -n ecommerce
If the ecommerce namespace or services do not exist yet, that is expected until you deploy your application through Argo CD.


### Step 41 — Prepare Argo CD deployment

kubectl get pods -n argocd

kubectl get namespace ecommerce
kubectl get svc -n ecommerce
kubectl get pods -n argocd
ls -l argocd/
kubectl get svc -n ecommerce


cd ~/multi-svc-ecommrce-app-cicd
vim argocd/application.yaml
replace with repoURL: with
your github repository in yaml file save it
kubectl get applications -n argocd
Verify Kubernetes manifests
Check your Kubernetes namespace configuration
cat k8s/00-namespace.yaml
Verify the Docker image references
grep -Rn 'image:' k8s/
output must have 263860684319.dkr.ecr.eu-north-1.amazonaws.com

kubectl get storageclass

aws eks describe-addon \
  --cluster-name ecommerce-cluster \
  --addon-name aws-ebs-csi-driver \
  --region eu-north-1 \
  --query 'addon.status' \
  --output text
**Expected:**ACTIVE
vim k8s/01-gp3-storageclass.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  encrypted: "true"
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true


grep -Rn -A 15 'volumeClaimTemplates:\|kind: PersistentVolumeClaim' k8s/
In our output none of has none of them specifies storageClassName.
Update PostgreSQL PVCs add storage class name above resources.check below image

cd ~/multi-svc-ecommrce-app-cicd
vim k8s/02-order-db.yaml
vim k8s/02-user-db.yaml
vim k8s/02-product-db.yaml

make changes in all files
grep -Rn 'storageClassName:' k8s/
git status
git pull origin main

git add argocd/application.yaml k8s/02-order-db.yaml k8s/02-product-db.yaml k8s/02-user-db.yaml terraform/main.tf k8s/01-gp3-storageclass.yaml monitoring/prometheus-values.yaml

git commit -m "add and update manifest files in k8s and monitoring"
git push origin main
kubectl get pvc -n ecommerce
outpu will be first time No resources found in ecommerce namespace
Create the Argo CD Application
kubectl apply -f argocd/application.yaml

Because automatic synchronization is enabled, Argo CD will begin deploying the manifests from your GitHub repository.
Verify Argo CD synchronization
kubectl get applications -n argocd
kubectl get pods -n ecommerce
kubectl get deployments -n ecommerce
kubectl get pvc -n ecommerce
kubectl get svc -n ecommerce

Check Argo CD health
kubectl describe application ecommerce -n argocd
OutPut must be
Sync Status: Synced
Health Status: Healthy

Verify PostgreSQL storage
kubectl get pvc -n ecommerce

Check the live Kubernetes configuration
for db in order-db product-db user-db; do
  echo "===== $db ====="
  kubectl get deployment "$db" -n ecommerce \
    -o jsonpath='{range .spec.template.spec.containers[0].env[?(@.name=="PGDATA")]}{.value}{"\n"}{end}'
Done

Verify database readiness

for db in order-db product-db user-db; do
  echo "===== $db ====="
  kubectl logs deployment/$db -n ecommerce --tail=10
done
kubectl get pods -n ecommerce


kubectl get svc frontend -n ecommerce
copy the loadbalancer dns name ada50eb750e674f2dbf0b8f6c0d7dd00-661072552.eu-north-1.elb.amazonaws.com

curl -I <paste it here>

open browser→http://paste dns name here
Verify application-to-database connectivity
kubectl logs deployment/user-service -n ecommerce --tail=30

kubectl logs deployment/product-service -n ecommerce --tail=30

kubectl logs deployment/order-service -n ecommerce --tail=30

kubectl get pods -n monitoring
kubectl get servicemonitors -n ecommerce
kubectl get prometheus -n monitoring
kubectl get svc -n monitoring
kubectl get servicemonitors -n ecommerce --show-labels
kubectl get pods -n monitoring | grep Prometheus

open ecommerce server gitbahs terminal restrt Prometheus and Grafana again

run these command again

kubectl port-forward \
  -n monitoring \
  svc/kube-prometheus-stack-prometheus \
  9090:9090 \
  --address=0.0.0.0

Open one more ecommerce server gitbash terminal start Grafana
kubectl port-forward \
  -n monitoring \
  svc/kube-prometheus-stack-grafana \
  3000:80 \
  --address=0.0.0.0

Open browser and try it with ecommerce ec2 publicip:9090
ecommerce ec2 publicip:3000
Verify Ecommerce metrics in Prometheus

### Step 42 — Verify Ecommerce metrics in Prometheus

http://YOUR_ECOMMERCE_SERVER_PUBLIC_IP:9090
Query→ enter up → Click Execute.
You should see a list of monitored targets with values of 1 or 0.
•	1 means Prometheus successfully scraped the target.
•	0 means the scrape failed.
I saw here all 1 means success

Check your three Ecommerce services
Click on Status→ Target Health
Look for:user-service ,product-service,order-service if all are UP means metrics endpoints are correctly configured.



### Step 43 — Verify Grafana data source

http://YOUR_ECOMMERCE_SERVER_PUBLIC_IP:3000
Log in using your existing Grafana credentials.
Navigate to Connections → Data sources → Prometheus→ Click Save & test or Test
If it is successful
Navigate to Explore→Select Prometheus→ type up
You should see Prometheus target data.
Create your first Ecommerce Grafana dashboard
Step 1:Open Dashboards → New → New dashboard→ Add visualization. Right side + symbol→ Select the Prometheus data source.--> Enter the query→ sum(kube_pod_status_phase{namespace="ecommerce",phase="Running"})→Click on Run queries button(button near the bottom-right of the query editor.)
Step 2:Change visualization to Stat
1. Click All visualizations
At the top of the right-hand panel, next to Suggestions, click All visualizations.
2. Select Stat
In the visualization list, search for Stat and click it.

STEP 3 — Set the panel title
After selecting Stat, the right-hand panel should show configuration options.
1.	Find and expand Panel options.
2.	Locate the Title field.
3.	Replace New panel with:
Ecommerce - Running Pods
4. Optionally set the description to Number of running Kubernetes pods in the ecommerce namespace.
STEP 4 — Save the panel
Click the blue Save button in the top-right corner.
Enter name:Ecommerce - Kubernetes Monitoring
Discription: Ecommerce - Kubernetes Monitoring
Then confirm Save.


Then in left navigation bar→ click on Dashboards→You can see Ecommerce - Kubernetes Monitoring → click on that one→


For CPU usage:
Click on + symbol( right side navigation bar )→under panel we have one more + symbol click on that one→ click on Configure Visulization→paste the query

sum(rate(container_cpu_usage_seconds_total{
  namespace="ecommerce",
  container!="",
  container!="POD"
}[5m]))

Click on Run Queries→  click on Rightside navigation bar All Visualizations→ select Bar Chat→Title: CPU usage →Discription: CPU usage → click on Save→ message: CPU usage → save



For memory usage:
sum(container_memory_working_set_bytes{
  namespace="ecommerce",
  container!="",
  container!="POD"
})


### Step 44 — Configure Alertmanager


cd ~/multi-svc-ecommrce-app-cicd
cat monitoring/ecommerce-alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: ecommerce-alerts
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  groups:
    - name: ecommerce.rules
      rules:

        - alert: EcommercePodNotReady
          expr: |
            kube_pod_status_ready{
              namespace="ecommerce",
              condition="true"
            } == 0
          for: 2m
          labels:
            severity: warning
            application: ecommerce
          annotations:
            summary: "Ecommerce pod is not ready"
            description: "Pod {{ $labels.pod }} has been unready for more than 2 minutes."

        - alert: EcommerceDeploymentUnavailable
          expr: |
            (
              kube_deployment_spec_replicas{
                namespace="ecommerce"
              }
              -
              kube_deployment_status_replicas_available{
                namespace="ecommerce"
              }
            ) > 0
          for: 2m
          labels:
            severity: critical
            application: ecommerce
          annotations:
            summary: "Ecommerce deployment unavailable"
            description: "Deployment {{ $labels.deployment }} has fewer available replicas than desired."

        - alert: EcommerceHighMemoryUsage
          expr: |
            (
              sum by (namespace, pod, container) (
                container_memory_working_set_bytes{
                  namespace="ecommerce",
                  container!="",
                  container!="POD"
                }
              )
              /
              sum by (namespace, pod, container) (
                kube_pod_container_resource_limits{
                  namespace="ecommerce",
                  resource="memory",
                  unit="byte"
                }
              )
            ) > 0.8
          for: 5m
          labels:
            severity: warning
            application: ecommerce
          annotations:
            summary: "High Ecommerce container memory usage"
            description: "Container {{ $labels.container }} in pod {{ $labels.pod }} is using more than 80% of its memory limit."


kubectl apply --dry-run=client \
  -f monitoring/ecommerce-alerts.yaml

kubectl apply -f monitoring/ecommerce-alerts.yaml

kubectl get prometheusrules -n monitoring

kubectl describe prometheusrule ecommerce-alerts -n monitoring
Confirm Prometheus selects the rules
kubectl get prometheus kube-prometheus-stack-prometheus \
  -n monitoring \
  -o jsonpath='{.spec.ruleSelector}{"\n"}'

Open Prometheus:
http://YOUR_ECOMMERCE_SERVER_PUBLIC_IP:9090
Navigate to Status → Rules or Alerts, depending on your Prometheus version.



Open ecommerce server gitbash terminal
cd multi-svc-ecommrce-app-cicd
curl -s http://localhost:9090/api/v1/rules \
  | python3 -c 'import json,sys; data=json.load(sys.stdin); [(print(r.get("name"), "| State:", r.get("state"), "| Health:", r.get("health"))) for g in data.get("data",{}).get("groups",[]) if g.get("name")=="ecommerce.rules" for r in g.get("rules",[])]'

Alert rule	State	Health
EcommercePodNotReady	Inactive	OK
EcommerceDeploymentUnavailable	Inactive	OK
EcommerceHighMemoryUsage	Inactive	OK
Verify Prometheus connects to Alertmanager
curl -s http://localhost:9090/api/v1/alertmanagers   | python3 -m json.tool
kubectl get alertmanagerconfig -A
kubectl get secret alertmanager-kube-prometheus-stack-alertmanager   -n monitoring

Access Alertmanager
kubectl port-forward \
  -n monitoring \
  svc/kube-prometheus-stack-alertmanager \
  9093:9093 \
--address=0.0.0.0

Add inbound rule in ecommerce-sg
Custom TCP 9093 My IP
Open browser→ http:publicip of ecommerce server:9093
  201  vim monitoring/prometheus-values.yaml
  202  l
  203  ls
  204  helm install kube-prometheus-stack   prometheus-community/kube-prometheus-stack   -n monitoring   -f monitoring/prometheus-values.yaml   --wait   --timeout 10m
  205  kubectl get pods -n monitoring
  206  kubectl get crd servicemonitors.monitoring.coreos.com
  207  kubectl get svc -n monitoring
  208  kubectl get secret kube-prometheus-stack-grafana   -n monitoring   -o jsonpath="{.data.admin-password}" | base64 -d
  209  echo
  210  kubectl port-forward   -n monitoring   svc/kube-prometheus-stack-grafana   3000:80   --address=0.0.0.0
  211  exit
  212  aws eks describe-cluster   --name ecommerce-cluster   --region eu-north-1   --query 'cluster.status'   --output text
  213  helm get values kube-prometheus-stack   -n monitoring   -o yaml
  214  kubectl get servicemonitor -n monitoring   | grep -E 'controller-manager|scheduler'
  215  kubectl get endpoints -n kube-system   | grep -E 'controller-manager|scheduler'
  216  ls monitoring/
  217  ls
  218  cd multi-svc-ecommrce-app-cicd
  219  ls monitoring/
  220  cat  monitoring/ecommerce-alerts.yaml
  221  ls  monitoring/
  222  cat  monitoring/ prometheus-values.yaml
  223  cat  monitoring/prometheus-values.yaml
  224  cat  monitoring/kube-prometheus-stack-values.yaml
  225  vim monitoring/prometheus-values.yaml
  226  helm list -n monitoring
  227  helm get metadata kube-prometheus-stack -n monitoring
  228  cat monitoring/prometheus-values.yaml
  229  helm repo update
  230  helm show chart   prometheus-community/kube-prometheus-stack   --version 92.6.0
  231  helm upgrade kube-prometheus-stack   prometheus-community/kube-prometheus-stack   --version 92.6.0   --namespace monitoring   --reuse-values   -f monitoring/prometheus-values.yaml   --wait   --timeout 10m
  232  helm list -n monitoring
  233  kubectl get pods -n monitoring
  234  kubectl get servicemonitor -n monitoring   | grep -E 'controller-manager|scheduler'
  235  helm get values kube-prometheus-stack   -n monitoring   -o yaml
  236  kubectl get prometheusrule ecommerce-alerts -n monitoring
  237  history

kubectl get pods -n monitoring
kubectl get servicemonitor -n monitoring   | grep -E 'controller-manager|scheduler'
helm get values kube-prometheus-stack -n monitoring   -o yaml | grep -A 2 -E '^kubeControllerManager:|^kubeScheduler:'
kubectl get prometheusrule ecommerce-alerts -n monitoring


cd ~/multi-svc-ecommrce-app-cicd
git status
git pull origin main
git add  monitoring/ecommerce-alerts.yaml  monitoring/prometheus-values.yaml
git commit -m "updated monitring related yaml"
git push origin main
history

Open Alertmanager in your browser
kubectl port-forward \
  -n monitoring \
  svc/kube-prometheus-stack-alertmanager \
  9093:9093 \
  --address=0.0.0.0


Test a real Ecommerce alert
cat > /tmp/ecommerce-test-alert.yaml <<'EOF'
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: ecommerce-test-alert
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  groups:
    - name: ecommerce.test.rules
      rules:
        - alert: EcommerceDemoTestAlert
          expr: vector(1)
          for: 30s
          labels:
            severity: warning
            application: ecommerce
          annotations:
            summary: "Ecommerce Alertmanager test"
            description: "This is a temporary test alert."
EOF

kubectl apply -f /tmp/ecommerce-test-alert.yaml

Wait approximately 1–2 minutes for Prometheus to discover and evaluate the rule.
Check in Prometheus
Open:
http://localhost:9090
Go to Alerts and search for:
EcommerceDemoTestAlert
It should progress from Pending to Firing.
Check in Alertmanager
Open:
http://localhost:9093
Refresh the Alerts page and look for:
EcommerceDemoTestAlert
Successful test
If EcommerceDemoTestAlert appears as firing in Alertmanager, you have verified the alerting pipeline:
Prometheus Rule  → Prometheus → Alertmanager
Remove the test alert
After confirming the alert appears, remove the temporary rule:
kubectl delete prometheusrule ecommerce-test-alert \
  -n monitoring
**Verify:**
kubectl get prometheusrule -n monitoring \
  | grep ecommerce-test-alert

## Loki and Alloy logging


### Step 45 — Prepare for Loki and Alloy installation

We will now move to centralized logging for your Ecommerce application.
Your existing Grafana installation will be reused. There is no need to reinstall Grafana, Prometheus, or Alertmanager.
**WHERE:** ecommerce-server EC2
Run these commands:
kubectl get nodes -o wide
kubectl top nodes
kubectl get pods -A
kubectl get pvc -A
kubectl get storageclass
Also check whether Loki or Alloy is already installed:
helm list -A | grep -Ei 'loki|alloy'

Verify EKS capacity and Metrics Server
Check whether Metrics Server exists
kubectl get deployment metrics-server -n kube-system

kubectl get apiservice v1beta1.metrics.k8s.io

Check allocated node resources
kubectl describe nodes | grep -A 12 "Allocated resources:"

kubectl get nodes \
  -o custom-columns=NAME:.metadata.name,CPU:.status.allocatable.cpu,MEMORY:.status.allocatable.memory

Check the EKS Metrics Server add-on
aws eks describe-addon \
  --cluster-name ecommerce-cluster \
  --addon-name metrics-server \
  --region eu-north-1 \
  --query 'addon.status' \
  --output text
Metrics Server is not installed in your EKS cluster
Verify that the EKS Metrics Server add-on is available

aws eks describe-addon-versions \
  --addon-name metrics-server \
  --kubernetes-version 1.33 \
  --region eu-north-1 \
  --query 'addons[].addonVersions[].addonVersion' \
  --output table

Install the Metrics Server add-on
aws eks create-addon \
  --cluster-name ecommerce-cluster \
  --addon-name metrics-server \
  --region eu-north-1 \
  --resolve-conflicts OVERWRITE
This creates the Metrics Server add-on; it does not reinstall Prometheus.

Wait for installation
aws eks wait addon-active \
  --cluster-name ecommerce-cluster \
  --addon-name metrics-server \
  --region eu-north-1

aws eks describe-addon \
  --cluster-name ecommerce-cluster \
  --addon-name metrics-server \
  --region eu-north-1 \
  --query 'addon.{Status:status,Health:health.issues}' \
  --output json

**Expected:**
{
  "Status": "ACTIVE",
  "Health": []
}

Verify Metrics Server in Kubernetes
kubectl get pods -n kube-system | grep metrics-server

kubectl get apiservice v1beta1.metrics.k8s.io

Expected APIService availability: True.
Test actual resource usage:
kubectl top nodes
kubectl top pods -A

If kubectl top initially reports that metrics are unavailable, wait approximately one minute and retry.
Confirm available resources before Loki
Once Metrics Server is working, run:
kubectl top nodes
kubectl top pods -n monitoring
kubectl top pods -n ecommerce


CPU capacity is sufficient, but memory is relatively tight, particularly on Node 2. We should avoid the default distributed Loki deployment.
For your demonstration project, I recommend:
•	Loki in SingleBinary mode, with one replica.
•	MinIO disabled.
•	A small gp3 persistent volume.
•	Alloy as a DaemonSet for Kubernetes pod logs.
•	Reusing your existing Grafana instance.
Add the Grafana Helm repository
**WHERE:** ecommerce-server EC2
cd ~/multi-svc-ecommrce-app-cicd

helm repo add grafana https://grafana.github.io/helm-charts

helm repo update
**Verify:**
helm repo list
3. Create the logging namespace
kubectl create namespace logging
**Verify:**
kubectl get namespace logging
**Expected:**
NAME      STATUS
logging   Active
4. Create the logging configuration directory
cd ~/multi-svc-ecommrce-app-cicd

mkdir -p logging

ls -ld logging
5. Check available Loki chart versions and defaults
helm search repo grafana/loki --versions | head -10
Then inspect the default chart configuration:
helm show values grafana/loki > /tmp/loki-default-values.yaml
Check the relevant settings:
grep -n -E \
'deploymentMode:|singleBinary:|minio:|chunksCache:|resultsCache:|storageClass:' \
/tmp/loki-default-values.yaml
We need to confirm the chart version and values structure before writing the installation configuration. Loki's Helm chart settings can change between releases.
6. Verify your gp3 StorageClass
kubectl get storageclass gp3
Your earlier output already confirms that gp3 exists and uses the EBS CSI provisioner, so no new StorageClass is necessary.
7. Check node memory pressure
kubectl describe nodes | grep -A 6 "Conditions:"
Also check:
kubectl get pods -A --field-selector=status.phase=Pending
**Expected:** No unexpected Pending pods.
Inspect Loki chart settings

cd ~/multi-svc-ecommrce-app-cicd
helm show values grafana/loki \
  --version 7.3.0 \
  > /tmp/loki-7.3.0-values.yaml
Run:
sed -n '55,85p' /tmp/loki-7.3.0-values.yaml
sed -n '1460,1585p' /tmp/loki-7.3.0-values.yaml
sed -n '3664,3695p' /tmp/loki-7.3.0-values.yaml
sed -n '3775,3810p' /tmp/loki-7.3.0-values.yaml
sed -n '4041,4070p' /tmp/loki-7.3.0-values.yaml
These sections will help confirm the SingleBinary, persistent storage, cache, and MinIO settings.

### Step 45.2 — Prepare lightweight Loki configuration

Create the configuration file:
vim logging/loki-values.yaml
Paste:
deploymentMode: SingleBinary

loki:
  auth_enabled: false

  commonConfig:
    replication_factor: 1

  schemaConfig:
    configs:
      - from: "2024-01-01"
        store: tsdb
        object_store: filesystem
        schema: v13
        index:
          prefix: index_
          period: 24h

  storage:
    type: filesystem

  limits_config:
    retention_period: 48h

singleBinary:
  replicas: 1

  persistence:
    enabled: true
    storageClass: gp3
    size: 10Gi

  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 768Mi

read:
  replicas: 0

write:
  replicas: 0

backend:
  replicas: 0

minio:
  enabled: false

chunksCache:
  enabled: false

resultsCache:
  enabled: false

gateway:
  enabled: true
Save with Esc, :wq, Enter.
This configuration is intended for a small, single-replica demonstration environment. It is not a highly available production logging configuration. The 48-hour retention setting also requires the appropriate compactor configuration to enforce deletion; the value alone does not guarantee automatic cleanup.

### Step 45.3 — Validate before installing

Because you are using Loki chart 7.3.0, validate the configuration against that specific chart version:

mkdir -p /tmp/loki-chart

helm pull grafana/loki \
  --version 7.3.0 \
  --untar \
  --untardir /tmp/loki-chart

helm lint /tmp/loki-chart/loki \
  -f logging/loki-values.yaml

helm template loki /tmp/loki-chart/loki \
  -n logging \
  -f logging/loki-values.yaml \
  > /tmp/loki-rendered.yaml

grep -E '^kind: (Deployment|StatefulSet|PersistentVolumeClaim|Service)$' \
  /tmp/loki-rendered.yaml

helm template loki /tmp/loki-chart/loki \
  -n logging \
  -f logging/loki-values.yaml \
  --debug > /tmp/loki-debug.yaml

helm install loki /tmp/loki-chart/loki \
  -n logging \
  -f logging/loki-values.yaml \
  --wait \
  --timeout 10m

kubectl get pods -n logging
kubectl get pvc -n logging
helm list -n logging
If no Loki release exists, run:

helm install loki /tmp/loki-chart/loki \
  -n logging \
  -f logging/loki-values.yaml \
  --wait \
  --timeout 10m

kubectl get pods -n logging
kubectl get pvc -n logging
kubectl top nodes



  285  mkdir -p logging
  286  helm search repo grafana/loki --versions | head -10
  287  helm show values grafana/loki > /tmp/loki-default-values.yaml
  288  grep -n -E 'deploymentMode:|singleBinary:|minio:|chunksCache:|resultsCache:|storageClass:' /tmp/loki-default-values.yaml
  289  kubectl get storageclass gp3
  290  kubectl describe nodes | grep -A 6 "Conditions:"
  291  kubectl get pods -A --field-selector=status.phase=Pending
  292  clear
  293  helm show values grafana/loki   --version 7.3.0   > /tmp/loki-7.3.0-values.yaml
  294  sed -n '55,85p' /tmp/loki-7.3.0-values.yaml
  295  sed -n '1460,1585p' /tmp/loki-7.3.0-values.yaml
  296  sed -n '3664,3695p' /tmp/loki-7.3.0-values.yaml
  297  sed -n '3775,3810p' /tmp/loki-7.3.0-values.yaml
  298  sed -n '4041,4070p' /tmp/loki-7.3.0-values.yaml
  299  vim logging/loki-values.yaml
  300  helm lint grafana/loki   --version 7.3.0   -f logging/loki-values.yaml
  301  mkdir -p /tmp/loki-chart
  302  helm pull grafana/loki   --version 7.3.0   --untar   --untardir /tmp/loki-chart
  303  helm lint /tmp/loki-chart/loki   -f logging/loki-values.yaml
  304  helm template loki /tmp/loki-chart/loki   -n logging   -f logging/loki-values.yaml   > /tmp/loki-rendered.yaml
  305  grep -E '^kind: (Deployment|StatefulSet|PersistentVolumeClaim|Service)$'   /tmp/loki-rendered.yaml
  306  helm template loki /tmp/loki-chart/loki   -n logging   -f logging/loki-values.yaml   --debug > /tmp/loki-debug.yaml
  307  history
  308  helm template loki /tmp/loki-chart/loki   -n logging   -f logging/loki-values.yaml   --debug > /tmp/loki-debug.yaml


Check Loki Helm release
**WHERE:** ecommerce-server EC2
helm list -n logging -a
If the output contains no Loki release, continue.
2. Confirm configuration validation
cd ~/multi-svc-ecommrce-app-cicd

helm lint /tmp/loki-chart/loki \
  -f logging/loki-values.yaml
**Expected:**
1 chart(s) linted, 0 chart(s) failed
3. Install Loki
helm install loki /tmp/loki-chart/loki \
  -n logging \
  -f logging/loki-values.yaml \
  --wait \
  --timeout 10m
**Note:** Your cluster has limited free memory, so the installation may fail if Loki's runtime requirements exceed available capacity. If Helm times out, do not reinstall or delete the release immediately.
4. Verify installation
Run:
helm list -n logging -a
kubectl get pods -n logging -o wide
kubectl get pvc -n logging
kubectl top nodes
If Loki pods remain Pending or fail to start, run:
kubectl get events -n logging \
  --sort-by=.lastTimestamp | tail -30


### Step 46 — Install Grafana Alloy for Ecommerce logs

Alloy will collect logs from your Ecommerce Kubernetes pods and forward them to Loki. We will reuse the existing Grafana installation and avoid changing Prometheus or Alertmanager.

### Step 46.1 — Create Alloy configuration

**WHERE:** ecommerce-server EC2
Run:
cd ~/multi-svc-ecommrce-app-cicd

vim logging/alloy-values.yaml
Paste the following:
controller:
  type: deployment
  replicas: 1

alloy:
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 200m
      memory: 256Mi

  configMap:
    create: true
    content: |
      logging {
        level  = "info"
        format = "logfmt"
      }

      discovery.kubernetes "pods" {
        role = "pod"

        namespaces {
          names = ["ecommerce"]
        }
      }

      discovery.relabel "pod_logs" {
        targets = discovery.kubernetes.pods.targets

        rule {
          source_labels = ["__meta_kubernetes_namespace"]
          target_label  = "namespace"
        }

        rule {
          source_labels = ["__meta_kubernetes_pod_name"]
          target_label  = "pod"
        }

        rule {
          source_labels = ["__meta_kubernetes_pod_container_name"]
          target_label  = "container"
        }

        rule {
          source_labels = ["__meta_kubernetes_pod_label_app"]
          target_label  = "app"
        }
      }

      loki.source.kubernetes "pod_logs" {
        targets    = discovery.relabel.pod_logs.output
        forward_to = [loki.write.default.receiver]
      }

      loki.write "default" {
        endpoint {
          url = "http://loki-gateway.logging.svc.cluster.local/loki/api/v1/push"
        }
      }
For this two-node demo, I recommend one Alloy Deployment rather than a DaemonSet. The Kubernetes API-based log source can collect logs from pods across both nodes. Using one replica avoids duplicate log collection and consumes fewer resources.

### Step 46.2 — Inspect the Alloy chart

helm search repo grafana/alloy --versions | head -5
helm show values grafana/alloy > /tmp/alloy-default-values.yaml
Verify that the chart supports our configuration:
grep -n -E 'type: deployment|replicas:|configMap:|resources:' \
  /tmp/alloy-default-values.yaml | head -25

### Step 46.3 — Validate Alloy

helm template alloy grafana/alloy \
  -n logging \
  -f logging/alloy-values.yaml \
  > /tmp/alloy-rendered.yaml
Check the generated workload:
grep -A 8 '^kind: Deployment$' /tmp/alloy-rendered.yaml
If rendering reports an error, stop and share it before installation.

### Step 46.4 — Install Alloy

helm install alloy grafana/alloy \
  -n logging \
  -f logging/alloy-values.yaml \
  --wait \
  --timeout 5m

### Step 46.5 — Verify Alloy

helm list -n logging
kubectl get pods -n logging
kubectl logs -n logging deployment/alloy \
  --tail=50
kubectl top pods -n logging
kubectl top nodes
**Expected:** Loki remains running, Alloy is running, and the nodes remain free of memory pressure.

### Step 46.6 — Check Alloy permissions

Because Alloy reads pod logs through the Kubernetes API, it requires appropriate Kubernetes RBAC permissions.
Run:
kubectl auth can-i get pods/log \
  --as=system:serviceaccount:logging:alloy \
  -n ecommerce
**Expected:**
yes
If it returns no, do not create broad permissions immediately. Share the result so we can configure the minimum required access.

### Step 47 — Connect Loki to your existing Grafana

After Alloy is running, open your existing Grafana interface.
Navigate to Connections → Data sources → Add new data source → Loki.
Enter:
Setting	Value
Name	Loki
Type	Loki
URL	http://loki-gateway.logging.svc.cluster.local
Authentication	None for this internal demo setup
Click Save & test.
Open Grafana Explore
Then open Explore, select the Loki data source at the top,→ switch to Code mode → Set the time range to Last 15 minutes or Last 1 hour→ and Enter the following LogQL query:
{namespace="ecommerce"}
Click Run query
This query retrieves logs collected from containers in the ecommerce namespace.
If logs are available, you should see timestamped log lines.

You can also filter logs by service:
{namespace="ecommerce", container="user-service"}

Verify Alloy is running
**WHERE:** ecommerce-server EC2
Run:
helm list -n logging
Expected releases:
loki
alloy
Then:
kubectl get pods -n logging
You should see Loki and Alloy pods running.
Check Alloy logs:
kubectl logs -n logging deployment/alloy \
  -c alloy --tail=100
Check permissions:
kubectl auth can-i get pods/log \
  --as=system:serviceaccount:logging:alloy \
  -n ecommerce
**Expected:**
yes
**Important:** You have not yet shared output confirming Alloy was installed successfully. Loki can pass its Grafana connection test even when Alloy is missing. If helm list shows only Loki, complete STEP 57 before expecting Ecommerce application logs.

### Step 47.1 — Test each Ecommerce service in Grafana

Once {namespace="ecommerce"} returns logs, try filtering by container.
Service	LogQL query
All Ecommerce pods	{namespace="ecommerce"}
Frontend	{namespace="ecommerce", container="frontend"}
API Gateway	{namespace="ecommerce", container="api-gateway"}
User Service	{namespace="ecommerce", container="user-service"}
Product Service	{namespace="ecommerce", container="product-service"}
Order Service	{namespace="ecommerce", container="order-service"}








These queries assume the container names match the service names. If a query returns no data, inspect the actual container names with:
kubectl get pods -n ecommerce \
  -o custom-columns=POD:.metadata.name,CONTAINERS:.spec.containers[*].name
You can also list available container labels in Grafana:
{namespace="ecommerce"}
Expand a log line and inspect its labels to confirm the correct container and pod values.

### Step 47.2 — Generate application activity

To test log collection, generate some requests to your Ecommerce frontend.
First, find the frontend service:
kubectl get svc -n ecommerce
Locate the frontend LoadBalancer address. Open the application in your browser and navigate between pages.
Then return to Grafana Explore and run:
{namespace="ecommerce"}
Set the time range to Last 15 minutes and click Run query.
Application requests generate logs only when the relevant application or web server is configured to write them to stdout or stderr. If no new logs appear, inspect the source logs:
kubectl logs -n ecommerce deployment/frontend --tail=30
kubectl logs -n ecommerce deployment/user-service --tail=30
kubectl logs -n ecommerce deployment/product-service --tail=30
kubectl logs -n ecommerce deployment/order-service --tail=30
If kubectl logs displays application logs but Grafana does not, investigate Alloy ingestion.

### Step 47.3 — Create an Ecommerce logs dashboard

After verifying log ingestion, create a dedicated dashboard.
In Grafana:
1.	Click Dashboards in the left sidebar.
2.	Click New → New dashboard.
3.	Click Add visualization.
4.	Select the loki data source.
5.	Select all Visulaisation →search logs →Choose the Logs visualization.
6.	Enter the query:
{namespace="ecommerce"}
7.	Set the panel title to Ecommerce — All Application Logs.
8.	Click Apply.
Repeat for these panels:
Panel title	Query
Frontend Logs	{namespace="ecommerce", container="frontend"}
API Gateway Logs	{namespace="ecommerce", container="api-gateway"}
User Service Logs	{namespace="ecommerce", container="user-service"}
Product Service Logs	{namespace="ecommerce", container="product-service"}
Order Service Logs	{namespace="ecommerce", container="order-service"}
Use the actual container names verified in STEP 58.4.
Finally, click Save dashboard and enter:
Dashboard name: Ecommerce - Application Logs


Finally, click Save dashboard and enter:
Dashboard name: Ecommerce - Application Logs
final health check, run these commands on ecommerce-server:
kubectl get nodes
kubectl get pods -n ecommerce
kubectl get pods -n monitoring
kubectl get pods -n logging
kubectl get applications -n argocd
helm list -n logging

## Argo CD access


### Step 48 — Access Argo CD in Browser

check Argo cd open ecommerce gitbash terminal
kubectl get applications -n argocd
NAME        SYNC STATUS   HEALTH STATUS
ecommerce   Synced        Healthy

kubectl -n argocd get secret \
  argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d

echo
copy the password

kubectl port-forward \
  -n argocd \
  svc/argocd-server \
  8080:443 \
  --address=0.0.0.0

Or

kubectl port-forward \
  -n argocd \
  svc/argocd-server \
  8080:443 \
  --address=127.0.0.1
**Expected:**
Forwarding from 127.0.0.1:8080 -> 8080
Keep this terminal running.

Create an SSH tunnel from Windows
**WHERE:** Windows Git Bash — open a NEW terminal
Run:
ssh -i ~/Downloads/ecommerce-key.pem \
  -L 8080:localhost:8080 \
  ubuntu@<ECOMMERCE_SERVER_PUBLIC_IP>
Replace <ECOMMERCE_SERVER_PUBLIC_IP> with your actual EC2 public IP.




Start Argo CD port forwarding



## AWS cleanup


### Step 60 — Complete AWS infrastructure cleanup


### Step 60.1 — Stop Argo CD and Grafana browser connections

Close your browser sessions and stop any active kubectl port-forward commands using Ctrl+C.
You can also close the Windows SSH tunnels.

### Step 60.2 — Check Terraform-managed infrastructure

**WHERE:** ecommerce-server EC2
cd ~/multi-svc-ecommrce-app-cicd/terraform

terraform init

terraform state list
This shows the resources Terraform currently manages.
Do not delete the Terraform state file. Terraform needs it to destroy the infrastructure correctly.

### Step 60.3 — Check EKS resources before deletion

kubectl get pods -A
kubectl get pvc -A
kubectl get svc -A
Pay particular attention to LoadBalancer services and persistent volumes.

### Step 60.4 — Remove Kubernetes applications and Helm releases

If you want to remove the entire cluster, including its data, run the following from ecommerce-server while EKS is still accessible.
First, remove the Argo CD application to prevent automatic recreation of Ecommerce resources:
kubectl delete application ecommerce \
  -n argocd \
  --wait=true
Then remove Helm releases:
helm uninstall alloy -n logging
helm uninstall loki -n logging
helm uninstall kube-prometheus-stack -n monitoring
Check for any remaining Helm releases:
helm list -A
Delete the Ecommerce and logging namespaces:
kubectl delete namespace ecommerce logging monitoring argocd \
  --wait=true
**Note:** Kubernetes namespace deletion may remove PVCs and trigger EBS volume deletion. Wait for resources to terminate before destroying EKS.

### Step 60.5 — Verify AWS load balancers and volumes

Run:
aws elbv2 describe-load-balancers \
  --region eu-north-1 \
  --query 'LoadBalancers[*].[LoadBalancerName,State.Code,DNSName]' \
  --output table
Check EBS volumes:
aws ec2 describe-volumes \
  --region eu-north-1 \
  --query 'Volumes[*].[VolumeId,State,Size,Tags]' \
  --output json
These commands may show resources unrelated to this project. Do not delete unrelated resources.

### Step 60.6 — Destroy Terraform infrastructure

**WHERE:** ecommerce-server EC2
cd ~/multi-svc-ecommrce-app-cicd/terraform

terraform plan -destroy
Review the resources that Terraform plans to delete.
Then:
terraform destroy
When Terraform asks:
Do you really want to destroy all resources?
Type:
yes
Terraform will attempt to remove the resources recorded in its state.
**Important:** If your Terraform configuration also manages the EC2 instance you are connected to, destroying it may terminate your SSH session. In that case, run Terraform from your separate runner EC2 or another management machine with access to the same Terraform state.
I got error to delete ecr repositories
cd ~/multi-svc-ecommrce-app-cicd/terraform

sed -i '/image_tag_mutability = "MUTABLE"/a\  force_delete         = true' ecr.tf
**Verify:**
grep -n 'force_delete' ecr.tf
**Expected:** force_delete         = true
terraform fmt
terraform validate
terraform plan -destroy
terraform destroy
yes

after follow the above procedure alos still not deleted ecr repositories
aws sts get-caller-identity
Verify the repositories
aws ecr describe-repositories \
  --region eu-north-1 \
  --query 'repositories[].repositoryName' \
  --output table
You should find these five repositories:
•	ecommerce/frontend
•	ecommerce/api-gateway
•	ecommerce/user-service
•	ecommerce/product-service
•	ecommerce/order-service
3. Force-delete the repositories
**Warning:** The following commands permanently delete all Docker images stored in these five repositories.
Copy and execute this entire block:
for repo in \
  ecommerce/frontend \
  ecommerce/api-gateway \
  ecommerce/user-service \
  ecommerce/product-service \
  ecommerce/order-service
do
  echo "Deleting ECR repository: $repo"

  aws ecr delete-repository \
    --repository-name "$repo" \
    --region eu-north-1 \
    --force \
    --query 'repository.repositoryName' \
    --output text

done
AWS CLI's --force option allows deletion of repositories even when they contain images.
You should see the five repository names printed if all deletions succeed.
4. Verify ECR cleanup
Run:
aws ecr describe-repositories \
  --region eu-north-1 \
  --query 'repositories[].repositoryName' \
  --output table
The five Ecommerce repositories should no longer appear.

terraform state list
Some ECR resources may still appear in Terraform state even though they have already been deleted from AWS. This is normal until Terraform refreshes its state.
4. Validate Terraform
terraform fmt
terraform validate
5. Review the remaining destroy plan
terraform plan -destroy
Verify that the planned deletions belong to your Ecommerce project.
6. Run Terraform destroy again
terraform destroy
Enter yes when prompted.
Terraform should recognize that the ECR repositories have already been removed and continue deleting the remaining managed resources.

### Step 60.13 — Verify Terraform cleanup

After terraform destroy finishes, run:
terraform state list
If everything Terraform manages has been deleted, this command should produce no output.
Then verify the EKS cluster:
aws eks list-clusters --region eu-north-1

check all are deleted or not in aws console login
terminate the server and runner ec2




