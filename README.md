# End-to-End DevSecOps Implementation for an Ecommerce Microservices Application on AWS EKS

CI/CD with GitHub Actions, SonarQube, Trivy, Docker and Amazon ECR | GitOps with Argo CD | Infrastructure as Code with Terraform | Monitoring and Centralized Logging with Prometheus, Grafana, Alertmanager, Loki and Alloy | AWS Resource Cleanup
 

 
## Start with these two EC2 instances
EC2 1 — ecomm-runner

m7i-flex.large · Ubuntu 24.04 · 50 GiB gp3

EC2 2 — ecomm-server

t3.small · Ubuntu 24.04 · 30 GiB gp3


| Server | Instance type | Purpose |
| --- | --- | --- |
| ecomm-runner | m7i-flex.large | GitHub Runner, SonarQube, Docker, Trivy |
| ecomm-server | t3.small | Terraform, AWS CLI, kubectl, Helm |
| EKS | 2 × c7i-flex.large | Kubernetes application workloads |


## STEP 1 — Launch the two EC2 instances
WHERE: AWS Console → EC2 → Launch instances

Use Ubuntu Server 24.04 LTS, your existing ecommerce-key key pair, and the default VPC.

For ecomm-runner, select m7i-flex.large with 50 GiB gp3 storage.

For ecomm-server, select t3.small with 30 GiB gp3 storage.

Attach ecommerce-sg to both instances. Configure inbound SSH port 22 from My IP, and SonarQube port 9000 from My IP. Only open ports 8080 and 8081 from My IP if you plan to 

test the application directly on an EC2 instance.

Do not launch EKS worker nodes manually; Terraform will manage them later.

## STEP 2 — Connect to Runner EC2
WHERE: Windows Git Bash
```bash
ssh -i ~/Downloads/ecommerce-key.pem ubuntu@<RUNNER_PUBLIC_IP>
```
Set the hostname:
```bash
sudo hostnamectl set-hostname ecommerce-runner
exec bash
```
Update and install prerequisites:
```bash
sudo apt update
sudo apt upgrade -y

sudo apt install -y \
  git curl wget unzip jq gnupg \
  ca-certificates python3 python3-pip python3-venv
```
Verify:
```bash
hostname
git --version
python3 --version

```

## STEP 3 — Install Docker on Runner EC2
WHERE: RUNNER EC2
```bash
sudo install -m 0755 -d /etc/apt/keyrings

sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc

sudo chmod a+r /etc/apt/keyrings/docker.asc
```
Add the Docker repository:
```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```
Install Docker:
```bash
sudo apt update

sudo apt install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```
Log out and reconnect to activate Docker group membership:
```bash
exit
exit
```
Reconnect from Windows Git Bash:
```bash
ssh -i ~/Downloads/ecommerce-key.pem ubuntu@<RUNNER_PUBLIC_IP>
```
Verify:
```bash
docker --version
docker compose version
docker ps
docker run --rm hello-world
```

## STEP 4 — Configure SonarQube requirements
WHERE: RUNNER EC2
```bash
echo "vm.max_map_count=524288" | sudo tee /etc/sysctl.d/99-sonarqube.conf

echo "fs.file-max=131072" | sudo tee -a /etc/sysctl.d/99-sonarqube.conf

sudo sysctl --system
```
Verify:
```bash
sysctl vm.max_map_count
sysctl fs.file-max
```

## STEP 5 — Install SonarQube on the same Runner EC2
WHERE: RUNNER EC2
Create persistent Docker volumes:
```bash
docker volume create sonarqube_data
docker volume create sonarqube_extensions
docker volume create sonarqube_logs
```
Start SonarQube:
```bash
docker run -d \
  --name sonarqube \
  --restart unless-stopped \
  -p 9000:9000 \
  -v sonarqube_data:/opt/sonarqube/data \
  -v sonarqube_extensions:/opt/sonarqube/extensions \
  -v sonarqube_logs:/opt/sonarqube/logs \
  sonarqube:lts-community
```
Check the container:
```bash
docker ps
docker logs --tail=100 sonarqube
```
Wait for SonarQube to initialize, then test:
```bash
curl http://localhost:9000/api/system/status
```
Expected response contains:
{"status":"UP"}

Open SonarQube in your Windows browser:

http://<RUNNER_PUBLIC_IP>:9000

Complete the initial login with username: admin password: admin and password-change to admin123 process.




## STEP 6 — Connect to Management Server

WHERE: Another Windows Git Bash terminal

```bash
ssh -i ~/Downloads/ecommerce-key.pem ubuntu@<SERVER_PUBLIC_IP>
```
Set the hostname and install basic tools:
```bash
sudo hostnamectl set-hostname ecommerce-server
exec bash

sudo apt update
sudo apt upgrade -y

sudo apt install -y \
  git curl wget unzip gnupg ca-certificates
```
Clone your existing repository:
```bash
cd ~
git clone https://github.com/harathi-mutyam/multi-svc-ecommrce-app-cicd.git
cd multi-svc-ecommrce-app-cicd
ls -la
```
Check the project files:
```bash
ls .github/workflows
ls terraform
ls k8s
cd terraform
cat main.tf
```
change node groups instance type ,minimum size , maximum size and desired size according to our requirement

**Verify the existing AWS resources**

Open AWS Console in browser

Check EC2 → Instances, EKS → Clusters, and ECR → Private repositories in eu-north-1.

## STEP 7— Install AWS CLI on Management Server

Open ecomm-server EC2 gitbash terminal

```bash
cd ~
curl -fsSL \
  https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip \
  -o awscliv2.zip
unzip awscliv2.zip
sudo ./aws/install
```
Verify:
```bash
aws --version
```
For AWS authentication, an EC2 IAM role with appropriate permissions is preferable to storing long-lived access keys. If you have already attached an IAM role, test:
```bash
aws sts get-caller-identity
```
Otherwise, configure your authorized AWS CLI credentials securely using your existing IAM setup. Do not share your access keys here.
Set the region:
```bash
aws configure set region eu-north-1
aws configure
```
Verify:
```bash
aws sts get-caller-identity
aws configure get region
```
Your AWS account ID should match the account where you are deploying the project.

## STEP 9 — Install Terraform

Open ecomm-server EC2 gitbash terminal

```bash
sudo apt update
sudo apt install -y \
  gnupg \
  software-properties-common \
  curl \
  wget
```
Add the HashiCorp signing key:

```bash
wget -O- https://apt.releases.hashicorp.com/gpg \
  | gpg --dearmor \
  | sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg >/dev/null
```
Add the repository:

```bash
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/hashicorp.list
```
Install Terraform:

```bash
sudo apt update
sudo apt install -y terraform
```
Verify:

```bash
terraform version
```

## STEP 10 — Install kubectl

Open ecomm-server EC2 gitbash terminal

Install a kubectl release compatible with your intended EKS Kubernetes version. For the Kubernetes 1.36 configuration in your notes:

```bash
curl -LO \
  https://dl.k8s.io/release/v1.36.0/bin/linux/amd64/kubectl

curl -LO \
  https://dl.k8s.io/release/v1.36.0/bin/linux/amd64/kubectl.sha256

echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check

sudo install -o root -g root -m 0755 \
  kubectl /usr/local/bin/kubectl
```
Verify:

```bash
kubectl version --client
```
Before creating EKS, we will confirm that the selected Kubernetes version is supported in your AWS region.

## STEP 11 — Install Helm

Open ecomm-server EC2 gitbash terminal

```bash
curl -fsSL -o get_helm.sh \
  https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
```
Review the script:
```bash
less get_helm.sh
```
Press q to exit.
Install:
```bash
chmod 700 get_helm.sh
./get_helm.sh
```
Verify:
```bash
helm version

```

## STEP 12 — Check Runner and SonarQube

open ecomm-runner EC2 gitbash terminal

```bash
docker --version
docker ps
curl http://localhost:9000/api/system/status
free -h
```
Expected SonarQube status:{"status":"UP"}


## STEP 13 — Create the SonarQube project

Open Windows browser check it

http://<RUNNER_PUBLIC_IP>:9000

Log in to SonarQube. With username : admin , password: admin

Change password: admin123

Navigate to:

Projects → Create Project → Local Project-->manually

Enter:

| Field | Value |
| --- | --- |
| Project display name | Ecommerce-Cart-Microservices |
| Project key | ecommerce-microservices-demo |
| Main branch | main |

Click Set Up.

When prompted for the analysis method, select GitHub Actions.

## STEP 14 — Generate SonarQube token

WHERE: SonarQube browser

Select github actions--> Generate an analysis token for the project.

Suggested token name:  ecommerce-github-actions

Copy the generated token.

Now open your GitHub repository in browser:

harathi-mutyam/multi-svc-ecommrce-app-cicd

Navigate to:Settings → Secrets and variables → Actions → Secrets → New repository secret

Create:

| Name | Value |
| --- | --- |
| SONAR_TOKEN | Your generated SonarQube token |

Then go to Variables → New repository variable.

Create:

| Name | Value |
| --- | --- |
| SONAR_HOST_URL | http://localhost:9000 |
	
Because GitHub Actions Runner and SonarQube are running on the same EC2, the runner can access SonarQube through localhost:9000.

## STEP 15 — Install Node.js on Runner EC2

WHERE: ecomm-runner EC2

Install Node.js for the frontend build and CI/CD validation.

```bash
sudo apt update
sudo apt install -y nodejs npm
```
Verify:
```bash
node --version
npm --version
```
Check your repository's frontend package.json for the required Node.js version. If the installed version is too old, install a compatible supported LTS release before running the pipeline.

## STEP 16 — Install Trivy on Runner EC2
WHERE: ecomm-runner EC2

Trivy scans Docker images for known vulnerabilities.

Install prerequisites:

```bash
sudo apt install -y wget apt-transport-https gnupg
```
Add the Trivy signing key:
```bash
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key \
  | gpg --dearmor \
  | sudo tee /usr/share/keyrings/trivy.gpg >/dev/null
```
Add the Trivy repository:
```bash
echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb generic main" \
  | sudo tee /etc/apt/sources.list.d/trivy.list
```
Install:
```bash
sudo apt update
sudo apt install -y trivy
```
Verify:
```bash
trivy --version
```

## STEP 17 — Install AWS CLI on Runner EC2
WHERE: ecomm-runner EC2
```bash
cd ~
curl -fsSL \
  https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip \
  -o awscliv2.zip

unzip awscliv2.zip
sudo ./aws/install
```
Verify:
```bash
aws –version
```
**Crean an iam user with access keys and secret keys in aws console**.Save AccessKey and Secret Keys

For AWS access, preferably attach a dedicated IAM instance profile to ecomm-runner with only the permissions required for ECR image pushes and your CI/CD workflow.

Then verify:
```bash
aws sts get-caller-identity
```
Set the region:
```bash
aws configure set region eu-north-1
aws configure
```
enter access key ,secret key , enter region, json
```bash
aws configure get region
```

## STEP 18 — Register GitHub Self-Hosted Runner

WHERE: GitHub browser

Open your project github repository--> Settings → Actions → Runners → New self-hosted runner

Select:
| • | Operating system: Linux |
| --- | --- |
| • | Architecture: x64 |
GitHub will display installation commands.

Open ecomm-runner EC2 gitbash terminal

Create the runner directory:

```bash
cd ~
mkdir -p actions-runner
cd actions-runner
```
Copy the current download and extraction commands directly from GitHub and execute them here. 

Next, copy the configuration command displayed by GitHub.

During configuration, use:

| Prompt | Value |
| --- | --- |
| Runner group | Press Enter |
| Runner name | ecommerce-runner |
| Additional labels | ecommerce-runner |
| Work folder | Press Enter |
Install the runner as a service:
```bash
cd ~/actions-runner
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```
Expected status:

Active: active (running)

Do not start ./run.sh separately when the runner is already running as a service.

## STEP 19 — Verify GitHub Runner

Open browser--> project github Repository → Settings → Actions → Runners

You should see:

| Runner | Status |
| --- | --- |
| ecommerce-runner | Idle or Active |
If the runner appears Offline, check:
```bash
cd ~/actions-runner
sudo ./svc.sh status
```

## STEP 20 — Verify Runner and SonarQube connectivity

Open ecomm-runner EC2 gitbash terminal

```bash
curl http://localhost:9000/api/system/status
```
Expected response includes: **{"status":"UP"}**

Check the installed tools:

Use Terraform to create all five Amazon ECR repositories.

Use the same Terraform deployment to create the VPC, subnets, NAT Gateway, EKS cluster, worker nodes, IAM roles and EKS add-ons.

Verify the infrastructure and ECR repositories.

Later, inspect your existing GitHub Actions ci-cd.yml and configure the pipeline to build and push Docker images to ECR.

Continue with Argo CD, Prometheus, Grafana, Alertmanager, Loki and Alloy.


## STEP 21 — Prepare Terraform on Server EC2

WHERE: ecomm-server EC2

Connect to your server and navigate to the repository:

```bash
cd ~/multi-svc-ecommrce-app-cicd
cd terraform
ls -lah
```
**Verify AWS authentication:**

```bash
aws configure get region
terraform version
```
Your AWS region should be eu-north-1.

Before modifying Terraform, check the existing state and resources:

```bash
terraform init
terraform state list
aws eks list-clusters --region eu-north-1

aws ecr describe-repositories \
  --region eu-north-1 \
  --query 'repositories[].repositoryName' \
  --output table
```
If an existing ecommerce-cluster or ECR repository is not tracked by your Terraform state, reconcile or import it before applying. Otherwise, Terraform may fail with an already-exists error.

Push changes to github

```bash
cd ..
cd multi-svc-ecommrce-app-cicd
```
**set git username and git email id**

```bash
git config --global user.name harathi-mutyam
git config --global user.email ehmutyam@gmail.com
git pull origin main
git add terraform/main.tf terraform/ecr.tf terraform/outputs.tf
git commit -m "changed tf files"
```
provide git username

```bash
git password: <paste github token >

```
get the git hub token using below procedure

**Create GitHub Personal Access Token (PAT)**

Open github in browser--> select your project repository-->

Profile Picture -->Settings  --> Developer  Settings  -->Personal Access Tokens  --> Tokens (classic)-->

Generate new token (classic)

Token configuration:

| Setting | Value |
| --- | --- |
| Note | Ecommerce EC2 Git Push |
| Expiration | 30 days or as required |
| Scope | Select repo |
| Additional scope | Select workflow, if updating workflow files |

Click on generate  --> save the personal_access_token at somewhere

**Verify your existing EKS Terraform configuration**

```bash
aws iam list-attached-user-policies   --user-name harathi1203
```
expected policy 

arn:aws:iam::aws:policy/AdministratorAccess

## STEP 22 — Terraform initialization and validation
```bash
terraform fmt -recursive
terraform init
terraform validate
```
Expected validation result:Success! The configuration is valid.

Now create the Terraform plan:

```bash
terraform plan -out=ecommerce.tfplan
```
Review it:
```bash
terraform show ecommerce.tfplan
terraform apply ecommerce.tfplan
```
after all resources created check 

## Step 23 - Verify all resources 

Verify EBS CSI driver

```bash
aws eks describe-addon \
  --cluster-name ecommerce-cluster \
  --addon-name aws-ebs-csi-driver \
  --region eu-north-1 \
  --query 'addon.{Status:status,Health:health.issues,PodIdentity:podIdentityAssociations}' \
  --output json
```
Expected status: Active
```bash
kubectl get pods -n kube-system | grep ebs
```
All EBS CSI controller and node containers should eventually show Running and be ready.
```bash
kubectl get nodes
```
Expected: STATUS must be Ready
Verify ECR repositories
```bash
aws ecr describe-repositories \
  --region eu-north-1 \
  --query 'repositories[].repositoryName' \
  --output table
```
Expected repository names: ecommerce/frontend ,ecommerce/api-gateway ,ecommerce/user-service,ecommerce/product-service, ecommerce/order-service

Display their URLs:

```bash
terraform output ecr_repository_urls
```
At this stage, the ECR repositories can be empty. Your CI/CD workflow will push images later.

Verify EKS infrastructure

Check the cluster:

```bash
aws eks describe-cluster \
  --name ecommerce-cluster \
  --region eu-north-1 \
  --query 'cluster.[name,status,version]' \
  --output table
 
```

## Step 24: Configure Kubernetes access:

```bash
aws eks update-kubeconfig \
  --region eu-north-1 \
  --name ecommerce-cluster
```
Check the worker nodes:

```bash
kubectl get nodes -o wide
```
Node must be ready

Check the add-ons:

```bash
aws eks list-addons \
  --cluster-name ecommerce-cluster \
  --region eu-north-1
```
Push the changes to github from ec2
```bash
cd ..
git status
git pull orgin main
git add terraform/main.tf terraform/variables.tf  terraform/versions.tf  terraform/ebs-csi-iam.tf
git commit -m "added ebs-csi-iam.tf"
git push origin main
cd terraform
terraform output cluster_name
```
"ecommerce-cluster"
```bash
terraform output ecr_urls
```
output will be
```bash
{
  "ecommerce/api-gateway" = "263860684319.dkr.ecr.eu-north-1.amazonaws.com/ecommerce/api-gateway"
  "ecommerce/frontend" = "263860684319.dkr.ecr.eu-north-1.amazonaws.com/ecommerce/frontend"
  "ecommerce/order-service" = "263860684319.dkr.ecr.eu-north-1.amazonaws.com/ecommerce/order-service"
  "ecommerce/product-service" = "263860684319.dkr.ecr.eu-north-1.amazonaws.com/ecommerce/product-service"
  "ecommerce/user-service" = "263860684319.dkr.ecr.eu-north-1.amazonaws.com/ecommerce/user-service"
}
```
```bash
kubectl get pods -A
```
all pods must be in running state
```bash
kubectl get storageclass

NAME   PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
gp3    kubernetes.io/aws-ebs   Delete          WaitForFirstConsumer   false                  68m
```


```bash
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
 
cd ~/multi-svc-ecommrce-app-cicd
```
ls 
```bash
ls k8s/
cat .github/workflows/ci-cd.yml
```

## Step 25: Configure GitHub Actions secrets and variables

Open Your GitHub repository--> Settings → Secrets and variables → Actions.Add below secrets

Under Repository secrets, verify:

| Secret | Purpose |
| --- | --- |
| AWS_ACCESS_KEY_ID | IAM user access key |
| AWS_SECRET_ACCESS_KEY | IAM user secret key |
| SONAR_TOKEN | Saved SonarQube analysis token |
	
Repository variables, configure

| Variable | Value |
| --- | --- |
| AWS_REGION | eu-north-1 |
| ECR_REGISTRY | 263860684319.dkr.ecr.eu-north-1.amazonaws.com |
| SONAR_HOST_URL | http://localhost:9000 |

	
Copy the ECR_Registry value from aws console browser-->ecr--> copy upto amazonaws.com--> paste it in github variable

Note: localhost:9000 works because SonarQube and the self-hosted runner are on the same EC2 instance.


## Step 26 — Verify your GitHub Actions runner before executing cicd

Open ecomm-runner EC2 gitbash terminal

```bash
cd ~/actions-runner
sudo ./svc.sh status
curl -s http://localhost:9000/api/system/status
```
Your GitHub runner must also appear as Idle under:

GitHub → Repository → Settings → Actions → Runners.

## STEP 27 — Test the pipeline for that purpose make some changes and push to github repository
Open server gitbash terminal
```bash
cd ~/multi-svc-ecommrce-app-cicd
```
vim .github/workflows/ci-cd.yml
```bash
git status
git pull origin main
git add .github/workflows/ci-cd.yml
git commit -m "chnages in ci-cd.yml file"
git push origin main
```
open browser-->open project repository in github --> Actions-->click on E-commerce Microservices CICD -->You can observe  pipeline is running now

After a successful run, verify images in ECR:

open aws console login--> ecr--> check the changes

Or run the below command in server ec2 gitbash terminal 

```bash
aws ecr describe-images   --repository-name ecommerce/frontend   --region eu-north-1   --query 'imageDetails[].imageTags'
 
git pull origin main
git log -3 --oneline
 
```
Output will be 

ci: update Kubernetes images <commit-sha>

## Step 28: Continues Deployment Part
Install Argo CD
Open ecommerce server gitbash terminal
```bash
kubectl create namespace argocd

kubectl apply \
  --server-side \
  --force-conflicts \
  -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

kubectl get pods -n argocd
```
Wait until all required Argo CD components are ready.

```bash
cd ~/multi-svc-ecommrce-app-cicd
```
vim argocd/application.yaml
replace with repoURL: with your github repository in yaml file save it
Create the Argo CD Application
```bash
kubectl apply -f argocd/application.yaml
```
Because automatic synchronization is enabled, Argo CD will begin deploying the manifests from your GitHub repository.

```bash
kubectl get applications -n argocd
```
Verify Argo CD synchronization

```bash
kubectl get applications -n argocd
kubectl get pods -n ecommerce
kubectl get deployments -n ecommerce
kubectl get pvc -n ecommerce
kubectl get svc -n ecommerce
```
Check Argo CD health

```bash
kubectl describe application ecommerce -n argocd
```
OutPut must be

Sync Status: Synced  Health Status: Healthy

**Verify PostgreSQL storage**

```bash
kubectl get pvc -n ecommerce
 

```
Check the live Kubernetes configuration
```bash
for db in order-db product-db user-db; do
  echo "===== $db ====="
  kubectl get deployment "$db" -n ecommerce \
    -o jsonpath='{range .spec.template.spec.containers[0].env[?(@.name=="PGDATA")]}{.value}{"\n"}{end}'
Done

```
Verify database readiness

```bash
for db in order-db product-db user-db; do
  echo "===== $db ====="
  kubectl logs deployment/$db -n ecommerce --tail=10
done

kubectl get pods -n ecommerce
 

kubectl get svc frontend -n ecommerce
```
copy the loadbalancer dns name ada50eb750e674f2dbf0b8f6c0d7dd00-661072552.eu-north-1.elb.amazonaws.com

```bash
curl -I <paste it here>
```
open browser-->check it with http://paste dns name here
Verify application-to-database connectivity
```bash
kubectl logs deployment/user-service -n ecommerce --tail=30
kubectl logs deployment/product-service -n ecommerce --tail=30
kubectl logs deployment/order-service -n ecommerce --tail=30

```

## Step  29: Access Argo CD in Browser

```bash
kubectl get applications -n argocd

NAME        SYNC STATUS   HEALTH STATUS
ecommerce   Synced        Healthy
```
**Start Argo CD port forwarding**
```bash
kubectl -n argocd get secret \
  argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
echo
```

Copy the password save it somewhere

```bash
kubectl port-forward \
  -n argocd \
  svc/argocd-server \
  8080:443 \
  --address=0.0.0.0

```
Or
```bash
kubectl port-forward \
  -n argocd \
  svc/argocd-server \
  8080:443 \
  --address=127.0.0.1

Expected:
Forwarding from 127.0.0.1:8080 -> 8080
Keep this terminal running.

Create an SSH tunnel from Windows
WHERE: Windows Git Bash — open a NEW terminal
Run:

ssh -i ~/Downloads/ecommerce-key.pem \
  -L 8080:localhost:8080 \
  ubuntu@<ECOMMERCE_SERVER_PUBLIC_IP>
 ```
Replace <ECOMMERCE_SERVER_PUBLIC_IP> with your actual EC2 public IP.

For login enter username: enter admin password: enter saved secret

You can observe healthy and synched




##       Monitoring Part

## Step 30: Install Prometheus Operator 

open ecommerce gitbash terminal

```bash
kubectl get nodes -o wide
```
Two nodes must be in Ready status
| Worker node | Status | Instance type |
| --- | --- | --- |
| ip-10-30-1-27 | Ready | c7i-flex.large |
| ip-10-30-2-4 | Ready | c7i-flex.large |
		
If 2 nodes are ready start installing Prometheus

## Step 30.1 : Add the Prometheus Helm repository
```bash
helm repo add prometheus-community \
  https://prometheus-community.github.io/helm-charts

helm repo update

kubectl create namespace monitoring


```

## Step 30.2 : Create resource-optimized Helm values
Because we have only 8 GiB total worker memory, So use a lightweight monitoring configuration.

```bash
cd ~/multi-svc-ecommrce-app-cicd
cat monitoring/prometheus-values.yaml
```

## Step 31 : Install the monitoring stack for Grafana ,alert manager and Node exporter

```bash
helm install kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  -n monitoring \
  -f monitoring/prometheus-values.yaml \
  --wait \
  --timeout 10m
 
kubectl get pods -n monitoring
kubectl get crd servicemonitors.monitoring.coreos.com
kubectl get svc -n monitoring
 
```

## Step 32: Granafana for monitoring

Get Grafana login credentials

```bash
kubectl get secret kube-prometheus-stack-grafana \
  -n monitoring \
  -o jsonpath="{.data.admin-password}" | base64 -d
```
echo

Grafana username and passwords are

Username: admin password: copy it & save it.

Add port number 3000 in security group:

Open aws console in browser-->ec2-->security group--> select eccomerce-sg-->add in bound rule-->

Cutom TCP port range: 3000  Source: My IP -->save it

Access Grafana securely from your Windows browser

Grafana service uses ClusterIP, it is not directly accessible from the internet.

```bash
kubectl port-forward \
  -n monitoring \
  svc/kube-prometheus-stack-grafana \
  3000:80 \
  --address=0.0.0.0

```
Check it in browser using 

**http://ecommerce-server-publicip:3000**

In login page provide username: admin password: paste saved Grafana password

Or use another way also secured way

```bash
kubectl port-forward \
  -n monitoring \
  svc/kube-prometheus-stack-grafana \
  3000:80
```
Leave this terminal running. It will display forwarding messages.

Next, open a new Windows Git Bash terminal and create an SSH tunnel:

```bash
ssh -i ~/Downloads/ecommerce-key.pem \
  -L 3000:localhost:3000 \
  ubuntu@<Ecommerc-SERVER_PUBLIC_IP>
```
Check it in browser using 
```bash
http://localhost:3000
```

## Step 33: Access Prometheus for monitoring

Access Prometheus securely from your Windows browser

Grafana service uses ClusterIP, it is not directly accessible from the internet.

```bash
kubectl port-forward \
  -n monitoring \
  svc/kube-prometheus-stack-prometheus \
  9090:9090 \
  --address=0.0.0.0


You will see Forwarding from 0.0.0.0:9090 -> 9090

Handling connection for 9090
Handling connection for 9090
Handling connection for 9090
```


Add port number 9090 in security group:

Open aws console in browser-->ec2-->security group--> select eccomerce-sg-->add in bound rule-->

Cutom TCP port range: 9090  Source: My IP -->save it

Open browser-->http://ecomerce-server-publicip:9090

After open the Prometheus in browser, navigate to Status → Target health to inspect scrape targets. 

 
You can see all are Status: UP

Click query --> enter up --> click on execute

## Step 34: Verify the Prometheus data source in Grafana dashboard

Open Grafana Dashboard Browser 

Navigate to :

Connections (in the left sidebar)→ Data sources → Prometheus → click Test

If the connection succeeds again, return to Explore and run

Click on Explore(in the left sidebar )--> here  type: up-->   click on this symbol

```bash
kubectl get servicemonitors -A
```
Then verify your existing Ecommerce Services:
```bash
kubectl get svc -n ecommerce
kubectl get pods -n monitoring

kubectl get servicemonitors -n ecommerce
kubectl get prometheus -n monitoring
kubectl get svc -n monitoring
kubectl get servicemonitors -n ecommerce --show-labels
kubectl get pods -n monitoring | grep Prometheus

```

## Step 35: open ecommerce server gitbash terminal restart Prometheus and Grafana again

run these command again
```bash
kubectl port-forward \
  -n monitoring \
  svc/kube-prometheus-stack-prometheus \
  9090:9090 \
  --address=0.0.0.0

```
Open one more ecommerce server gitbash terminal start Grafana
```bash
kubectl port-forward \
  -n monitoring \
  svc/kube-prometheus-stack-grafana \
  3000:80 \
  --address=0.0.0.0

```
Open browser and try it with <ecommerce ec2 publicip>:9090,

<ecommerce ec2 publicip>:3000

Verify Ecommerce metrics in Prometheus

## Step 36: Verify Ecommerce metrics in Prometheus
http://YOUR_ECOMMERCE_SERVER_PUBLIC_IP:9090
Query--> enter up --> Click Execute.
You should see a list of monitored targets with values of 1 or 0.
| • | 1 means Prometheus successfully scraped the target. |
| --- | --- |
| • | 0 means the scrape failed. |

I saw here all 1 means success

Check your three Ecommerce services

Click on Status--> Target Health

Look for: user-service, product-service, order-service if all are UP means metrics endpoints are correctly configured.

 


## Step 37 :Verify Grafana data source

http://YOUR_ECOMMERCE_SERVER_PUBLIC_IP:3000

Log in using your existing Grafana credentials.

Navigate to Connections → Data sources → Prometheus--> Click Save & test or Test

If it is successful 

Navigate to Explore-->Select Prometheus--> type **up**

You should see Prometheus target data.

Create your first Ecommerce Grafana dashboard

Open Dashboards → New → New dashboard --> Add visualization. Right side panel click on + symbol (verify it later again click on + symbol)--> Select the Prometheus data 

source.--> Enter the query--> sum(kube_pod_status_phase{namespace="ecommerce",phase="Running"})-->Click on Run queries button(button near the bottom-right of the query 

editor.)

Change visualization to Stat

**1. Click All visualizations**

At the top of the right-hand panel, next to Suggestions, click All visualizations.
**2. Select Stat**
In the visualization list, search for Stat and click it.

Set the panel title

After selecting Stat, the right-hand panel should show configuration options.

| 1. | Find and expand Panel options. |
| --- | --- |
| 2. | Locate the Title field. |
| 3. | Replace New panel with: |

Ecommerce - Running Pods

   4. Optionally set the description to Number of running Kubernetes pods in the ecommerce namespace.

Save the panel

Click the blue Save button in the top-right corner.

Enter name:Ecommerce - Kubernetes Monitoring

Discription: Ecommerce - Kubernetes Monitoring

Then confirm Save.


Then in left navigation bar--> click on Dashboards-->You can see Ecommerce - Kubernetes Monitoring --> click on that one-->

For CPU usage:

Click on + symbol( right side navigation bar )-->under panel we have one more + symbol click on that one--> click on Configure Visulization-->paste the query

```bash
sum(rate(container_cpu_usage_seconds_total{
  namespace="ecommerce",
  container!="",
  container!="POD"

}[5m]))
```
Click on Run Queries-->  click on Rightside navigation bar All Visualizations--> select Bar Chat-->Title: CPU usage -->Discription: CPU usage --> click on Save--> message:

CPU usage --> save



For memory usage:
```bash
sum(container_memory_working_set_bytes{
  namespace="ecommerce",
  container!="",
  container!="POD"

})
```
## STEP 38 — Configure Alertmanager

Open Ecommerce server gitbash terminal

```bash
cd ~/multi-svc-ecommrce-app-cicd
cat monitoring/ecommerce-alerts.yaml

kubectl apply --dry-run=client \
-f monitoring/ecommerce-alerts.yaml

kubectl apply -f monitoring/ecommerce-alerts.yaml
kubectl get prometheusrules -n monitoring
kubectl describe prometheusrule ecommerce-alerts -n monitoring
```
**Confirm Prometheus selects the rules**

```bash
kubectl get prometheus kube-prometheus-stack-prometheus \
  -n monitoring \
  -o jsonpath='{.spec.ruleSelector}{"\n"}'
```
**Open Prometheus in Browser:**

http://YOUR_ECOMMERCE_SERVER_PUBLIC_IP:9090

Navigate to Status → Rules or Alerts, depending on your Prometheus version.

 
Open ecommerce server gitbash terminal
```bash
cd multi-svc-ecommrce-app-cicd

curl -s http://localhost:9090/api/v1/rules \
  | python3 -c 'import json,sys; data=json.load(sys.stdin); [(print(r.get("name"), "| State:", r.get("state"), "| Health:", r.get("health"))) for g in data.get("data",{}).get("groups",[]) if g.get("name")=="ecommerce.rules" for r in g.get("rules",[])]'

 
```
Alert rule	State	Health

| EcommercePodNotReady | Inactive | OK |
| EcommerceDeploymentUnavailable | Inactive | OK |
| EcommerceHighMemoryUsage | Inactive | OK |
Verify Prometheus connects to Alertmanager
```bash
curl -s http://localhost:9090/api/v1/alertmanagers   | python3 -m json.tool

kubectl get alertmanagerconfig -A

kubectl get secret alertmanager-kube-prometheus-stack-alertmanager   -n monitoring

```
## Access Alertmanager through port forward

```bash
kubectl port-forward \
  -n monitoring \
  svc/kube-prometheus-stack-alertmanager \
  9093:9093 \
--address=0.0.0.0

```
Add inbound rule in ecommerce-sg
```bash
Custom TCP 9093 My IP
```

Open browser--> http:<publicip of ecommerce server>:9093


Check these commands why we want it take clarity

```bash
kubectl get pods -n monitoring

kubectl get servicemonitor -n monitoring   | grep -E 'controller-manager|scheduler'

helm get values kube-prometheus-stack -n monitoring   -o yaml | grep -A 2 -E '^kubeControllerManager:|^kubeScheduler:'

kubectl get prometheusrule ecommerce-alerts -n monitoring
```
Create temporary Alert and test it Later delete it

Open ecommerce server gitbash terminal 

```bash
cd multi-svc-ecommrce-app-cicd
```
Test a real Ecommerce alert
```bash
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

```
Wait approximately 1–2 minutes for Prometheus to discover and evaluate the rule.

### Check in Prometheus

Open browser: http://localhost:9090

Go to Alerts and search for: EcommerceDemoTestAlert

It should progress from Pending to Firing.

### Check in Alertmanager

Open: http://localhost:9093

Refresh the Alerts page and look for: EcommerceDemoTestAlert

If you found it test is successful 

Successful test

If EcommerceDemoTestAlert appears as firing in Alertmanager, you have verified the alerting pipeline:

Prometheus Rule  --> Prometheus --> Alertmanager

Remove the test alert

After confirming the alert appears, remove the temporary rule:

```bash
kubectl delete prometheusrule ecommerce-test-alert \
  -n monitoring
```
Verify:

```bash
kubectl get prometheusrule -n monitoring \
  | grep ecommerce-test-alert

```

## STEP 39 — Prepare for Loki and Alloy installation

For centralized logging for your Ecommerce application.

Your existing Grafana installation will be reused. There is no need to reinstall Grafana, Prometheus, or Alertmanager.

Open ecommerce-server EC2 gitbash terminal

```bash
kubectl get nodes -o wide
kubectl top nodes
kubectl get pods -A
kubectl get pvc -A
kubectl get storageclass
```
Also check whether Loki or Alloy is already installed:
```bash
helm list -A | grep -Ei 'loki|alloy'
```
Verify EKS capacity and Metrics Server
Check whether Metrics Server exists
```bash
kubectl get deployment metrics-server -n kube-system

kubectl get apiservice v1beta1.metrics.k8s.io

```
Check allocated node resources
```bash
kubectl describe nodes | grep -A 12 "Allocated resources:"

kubectl get nodes \
  -o custom-columns=NAME:.metadata.name,CPU:.status.allocatable.cpu,MEMORY:.status.allocatable.memory

```
Check the EKS Metrics Server add-on
```bash
aws eks describe-addon \
  --cluster-name ecommerce-cluster \
  --addon-name metrics-server \
  --region eu-north-1 \
  --query 'addon.status' \
  --output text
```
Metrics Server is not installed in your EKS cluster
Verify that the EKS Metrics Server add-on is available
```bash
aws eks describe-addon-versions \
  --addon-name metrics-server \
  --kubernetes-version 1.33 \
  --region eu-north-1 \
  --query 'addons[].addonVersions[].addonVersion' \
  --output table
```
Install the Metrics Server add-on
```bash
aws eks create-addon \
  --cluster-name ecommerce-cluster \
  --addon-name metrics-server \
  --region eu-north-1 \
  --resolve-conflicts OVERWRITE
```
This creates the Metrics Server add-on; it does not reinstall Prometheus.
Wait for installation
```bash
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

```
Expected:
{
  "Status": "ACTIVE",   "Health": []
}

Verify Metrics Server in Kubernetes
```bash
kubectl get pods -n kube-system | grep metrics-server

kubectl get apiservice v1beta1.metrics.k8s.io

```
Expected APIService availability: True.
Test actual resource usage:
```bash
kubectl top nodes
kubectl top pods -A

```
If kubectl top initially reports that metrics are unavailable, wait approximately one minute and retry.

Confirm available resources before Loki

Once Metrics Server is working, run:

```bash
kubectl top nodes
kubectl top pods -n monitoring
kubectl top pods -n ecommerce

 
```
CPU capacity is sufficient, but memory is relatively tight, particularly on Node 2. We should avoid the default distributed Loki deployment.

For your demonstration project, use:

| • | Loki in SingleBinary mode, with one replica. |
| --- | --- |
| • | MinIO disabled. |
| • | A small gp3 persistent volume. |
| • | Alloy as a DaemonSet for Kubernetes pod logs. |
| • | Reusing your existing Grafana instance. |

Add the Grafana Helm repository

open ecommerce-server EC2 gitbash terminal

```bash
cd ~/multi-svc-ecommrce-app-cicd

helm repo add grafana https://grafana.github.io/helm-charts

helm repo update
```
Verify:
```bash
helm repo list
```
Create the logging namespace
```bash
kubectl create namespace logging
```
Verify:
```bash
kubectl get namespace logging
```
Expected:
NAME      STATUS
logging   Active
Create the logging configuration directory
```bash
cd ~/multi-svc-ecommrce-app-cicd
mkdir -p logging
ls -ld logging
```
5. Check available Loki chart versions and defaults
```bash
helm search repo grafana/loki --versions | head -10
```
Then inspect the default chart configuration:
```bash
helm show values grafana/loki > /tmp/loki-default-values.yaml
```
Check the relevant settings:
```bash
grep -n -E \

'deploymentMode:|singleBinary:|minio:|chunksCache:|resultsCache:|storageClass:' \
/tmp/loki-default-values.yaml
```
We need to confirm the chart version and values structure before writing the installation configuration. Loki's Helm chart settings can change between releases.
6. Verify your gp3 StorageClass
```bash
kubectl get storageclass gp3
```
Your earlier output already confirms that gp3 exists and uses the EBS CSI provisioner, so no new StorageClass is necessary.
7. Check node memory pressure
```bash
kubectl describe nodes | grep -A 6 "Conditions:"
```
Also check:
```bash
kubectl get pods -A --field-selector=status.phase=Pending
```
Expected: No unexpected Pending pods.

#### Inspect Loki chart settings

```bash
cd ~/multi-svc-ecommrce-app-cicd
helm show values grafana/loki \
  --version 7.3.0 \
  > /tmp/loki-7.3.0-values.yaml
```
Run:
```bash
sed -n '55,85p' /tmp/loki-7.3.0-values.yaml
sed -n '1460,1585p' /tmp/loki-7.3.0-values.yaml
sed -n '3664,3695p' /tmp/loki-7.3.0-values.yaml
sed -n '3775,3810p' /tmp/loki-7.3.0-values.yaml
sed -n '4041,4070p' /tmp/loki-7.3.0-values.yaml
```
These sections will help confirm the SingleBinary, persistent storage, cache, and MinIO settings.

Prepare lightweight Loki configuration

open the configuration file:

```bash
cat logging/loki-values.yaml
```
This configuration is intended for a small, single-replica demonstration environment. It is not a highly available production logging configuration. The 48-hour retention 

setting also requires the appropriate compactor configuration to enforce deletion; the value alone does not guarantee automatic cleanup.

Validate before installing

Because you are using Loki chart 7.3.0, validate the configuration against that specific chart version:


```bash
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
```
If no Loki release exists, run:

```bash
helm install loki /tmp/loki-chart/loki \
  -n logging \
  -f logging/loki-values.yaml \
  --wait \
  --timeout 10m

kubectl get pods -n logging
kubectl get pvc -n logging
kubectl top nodes
```
Check Loki Helm release
```bash
helm list -n logging -a
```
If the output contains no Loki release, continue.
Confirm configuration validation
```bash
cd ~/multi-svc-ecommrce-app-cicd

helm lint /tmp/loki-chart/loki \
  -f logging/loki-values.yaml
```
Expected:
1 chart(s) linted, 0 chart(s) failed
Install Loki
```bash
helm install loki /tmp/loki-chart/loki \
  -n logging \
  -f logging/loki-values.yaml \
  --wait \
  --timeout 10m
```
Note: Your cluster has limited free memory, so the installation may fail if Loki's runtime requirements exceed available capacity. If Helm times out, do not reinstall or 

delete the release immediately.

Verify installation

Run:
```bash
helm list -n logging -a
kubectl get pods -n logging -o wide
kubectl get pvc -n logging
kubectl top nodes
```
If Loki pods remain Pending or fail to start, run:
```bash
kubectl get events -n logging \
  --sort-by=.lastTimestamp | tail -30
```

## STEP 40 — Install Grafana Alloy for Ecommerce logs
Alloy will collect logs from your Ecommerce Kubernetes pods and forward them to Loki. We will reuse the existing Grafana installation and avoid changing Prometheus or Alertmanager.

## STEP 40.1 — Create Alloy configuration
Open ecommerce server gitbash terminal
```bash
cd ~/multi-svc-ecommrce-app-cicd
cat logging/alloy-values.yaml
```
For this two-node demo, I recommend one Alloy Deployment rather than a DaemonSet. The Kubernetes API-based log source can collect logs from pods across both nodes. Using one 

replica avoids duplicate log collection and consumes fewer resources.

## STEP 40.2 — Inspect the Alloy chart
```bash
helm search repo grafana/alloy --versions | head -5
helm show values grafana/alloy > /tmp/alloy-default-values.yaml
```
Verify that the chart supports our configuration:
```bash
grep -n -E 'type: deployment|replicas:|configMap:|resources:' \
  /tmp/alloy-default-values.yaml | head -25
```

## STEP 40.3 — Validate Alloy
```bash
helm template alloy grafana/alloy \
  -n logging \
  -f logging/alloy-values.yaml \
  > /tmp/alloy-rendered.yaml
```
Check the generated workload:
```bash
grep -A 8 '^kind: Deployment$' /tmp/alloy-rendered.yaml
```
If rendering reports an error, stop and share it before installation.

## STEP 40.4 — Install Alloy
```bash
helm install alloy grafana/alloy \
  -n logging \
  -f logging/alloy-values.yaml \
  --wait \
  --timeout 5m
```

## STEP 40.5 — Verify Alloy
```bash
helm list -n logging
kubectl get pods -n logging
kubectl logs -n logging deployment/alloy \
  --tail=50
kubectl top pods -n logging
kubectl top nodes
```
Expected: Loki remains running, Alloy is running, and the nodes remain free of memory pressure.

## STEP 40.6 — Check Alloy permissions
Because Alloy reads pod logs through the Kubernetes API, it requires appropriate Kubernetes RBAC permissions.
Run:
```bash
kubectl auth can-i get pods/log \
  --as=system:serviceaccount:logging:alloy \
  -n ecommerce
```
Expected:
```bash
yes
```
If it returns no, do not create broad permissions immediately. Share the result so we can configure the minimum required access.

## STEP 41 — Connect Loki to your existing Grafana
After Alloy is running, open your existing Grafana interface.
Navigate to Connections → Data sources → Add new data source → Loki.
Enter:
| Setting | Value |
| --- | --- |
| Name | Loki |
| Type | Loki |
| URL | http://loki-gateway.logging.svc.cluster.local |
| Authentication | None for this internal demo setup |
Click Save & test.
Open Grafana Explore
Then open Explore, select the Loki data source at the top,--> switch to Code mode --> Set the time range to Last 15 minutes or Last 1 hour--> and Enter the following LogQL query:
```bash
{namespace="ecommerce"}
```
Click Run query
This query retrieves logs collected from containers in the ecommerce namespace.
If logs are available, you should see timestamped log lines.
 
You can also filter logs by service:
```bash
{namespace="ecommerce", container="user-service"}

```
Verify Alloy is running
Open ecommerce-server EC2 gitbash terminal
```bash
helm list -n logging
```
Expected releases: loki , alloy
```bash
kubectl get pods -n logging
```
You should see Loki and Alloy pods running.
Check Alloy logs:
```bash
kubectl logs -n logging deployment/alloy \
  -c alloy --tail=100
```
Check permissions:
```bash
kubectl auth can-i get pods/log \
  --as=system:serviceaccount:logging:alloy \
  -n ecommerce
```
Expected:
```bash
yes
```
Important: You have not yet shared output confirming Alloy was installed successfully. Loki can pass its Grafana connection test even when Alloy is missing. If helm list 

shows only Loki, complete STEP 57 before expecting Ecommerce application logs.

## STEP 42.1 — Test each Ecommerce service in Grafana
Once {namespace="ecommerce"} returns logs, try filtering by container.
| Service | LogQL query |
| --- | --- |
| All Ecommerce pods | {namespace="ecommerce"} |
| Frontend | {namespace="ecommerce", container="frontend"} |
| API Gateway | {namespace="ecommerce", container="api-gateway"} |
| User Service | {namespace="ecommerce", container="user-service"} |
| Product Service | {namespace="ecommerce", container="product-service"} |
| Order Service | {namespace="ecommerce", container="order-service"} |

 


 
 


These queries assume the container names match the service names. If a query returns no data, inspect the actual container names with:
```bash
kubectl get pods -n ecommerce \
  -o custom-columns=POD:.metadata.name,CONTAINERS:.spec.containers[*].name
```
You can also list available container labels in Grafana:
```bash
{namespace="ecommerce"}
```
Expand a log line and inspect its labels to confirm the correct container and pod values.

## STEP 42.2 — Generate application activity

To test log collection, generate some requests to your Ecommerce frontend.

First, find the frontend service:

```bash
kubectl get svc -n ecommerce
```

Locate the frontend LoadBalancer address. Open the application in your browser and navigate between pages.

Then return to Grafana Explore and run:
```bash
{namespace="ecommerce"}
```
Set the time range to Last 15 minutes and click Run query.

Application requests generate logs only when the relevant application or web server is configured to write them to stdout or stderr. If no new logs appear, inspect the source 

logs:
```bash
kubectl logs -n ecommerce deployment/frontend --tail=30
kubectl logs -n ecommerce deployment/user-service --tail=30
kubectl logs -n ecommerce deployment/product-service --tail=30
kubectl logs -n ecommerce deployment/order-service --tail=30
```
If kubectl logs displays application logs but Grafana does not, investigate Alloy ingestion.

## STEP 42.3 — Create an Ecommerce logs dashboard
After verifying log ingestion, create a dedicated dashboard.
In Grafana:
| 1. | Click Dashboards in the left sidebar. |
| --- | --- |
| 2. | Click New → New dashboard. |
| 3. | Click Add visualization. |
| 4. | Select the loki data source. |
| 5. | Select all Visulaisation -->search logs -->Choose the Logs visualization. |
| 6. | Enter the query:  {namespace="ecommerce"} | 
|7.	|Set the panel title to Ecommerce — All Application Logs.|
| 8. | Click Apply. |

Repeat for these panels:

| Panel title | Query |
| --- | --- |
| Frontend Logs | {namespace="ecommerce", container="frontend"} |
| API Gateway Logs | {namespace="ecommerce", container="api-gateway"} |
| User Service Logs | {namespace="ecommerce", container="user-service"} |
| Product Service Logs | {namespace="ecommerce", container="product-service"} |
| Order Service Logs | {namespace="ecommerce", container="order-service"} |

Use the actual container names verified in STEP 58.4.

Finally, click Save dashboard and enter:

Dashboard name: Ecommerce - Application Logs
 


Finally, click Save dashboard and enter:

Dashboard name: Ecommerce - Application Logs

final health check, run these commands on ecommerce-server:

```bash
kubectl get nodes
kubectl get pods -n ecommerce
kubectl get pods -n monitoring
kubectl get pods -n logging
kubectl get applications -n argocd
helm list -n logging
```

## Step 42.4 — End-to-End Loki and Alloy Verification.
Run these commands on ecommerce-server gitbash terminal
Check Helm releases:
```bash
helm list -n logging
```
Expected: loki and alloy.
Check pod status and storage:
```bash
kubectl get pods -n logging -o wide
kubectl get pvc -n logging
```
Check Alloy log collection:
```bash
kubectl logs -n logging deployment/alloy \
  -c alloy --tail=100
```
Check application logs in Grafana Explore:
```bash
{namespace="ecommerce"}

```

## STEP 43 — Complete AWS infrastructure cleanup
### 43.1 — Stop Argo CD and Grafana browser connections

Close your browser sessions and stop any active kubectl port-forward commands using Ctrl+C.

You can also close the Windows SSH tunnels.

### 43.2 — Check Terraform-managed infrastructure

WHERE: ecommerce-server EC2

```bash
cd ~/multi-svc-ecommrce-app-cicd/terraform
terraform init
terraform state list
```
This shows the resources Terraform currently manages.

Do not delete the Terraform state file. Terraform needs it to destroy the infrastructure correctly.

### 43.3 — Check EKS resources before deletion
```bash
kubectl get pods -A
kubectl get pvc -A
kubectl get svc -A
```
Pay particular attention to LoadBalancer services and persistent volumes.

### 43.4 — Remove Kubernetes applications and Helm releases

If you want to remove the entire cluster, including its data, run the following from ecommerce-server while EKS is still accessible.

First, remove the Argo CD application to prevent automatic recreation of Ecommerce resources:

```bash
kubectl delete application ecommerce \
  -n argocd \
  --wait=true
```
Then remove Helm releases:
```bash
helm uninstall alloy -n logging
helm uninstall loki -n logging
helm uninstall kube-prometheus-stack -n monitoring
```
Check for any remaining Helm releases:
```bash
helm list -A
```
Delete the Ecommerce and logging namespaces:

```bash
kubectl delete namespace ecommerce logging monitoring argocd \
  --wait=true
```
Note: Kubernetes namespace deletion may remove PVCs and trigger EBS volume deletion. Wait for resources to terminate before destroying EKS.

### 43.5 — Verify AWS load balancers and volumes
Run:

```bash
aws elbv2 describe-load-balancers \
  --region eu-north-1 \
  --query 'LoadBalancers[*].[LoadBalancerName,State.Code,DNSName]' \
  --output table
```
Check EBS volumes:

```bash
aws ec2 describe-volumes \
  --region eu-north-1 \
  --query 'Volumes[*].[VolumeId,State,Size,Tags]' \
  --output json
```
These commands may show resources unrelated to this project. Do not delete unrelated resources.

### 43.6 — Destroy Terraform infrastructure
```bash
cd ~/multi-svc-ecommrce-app-cicd/terraform

terraform plan -destroy
```
Review the resources that Terraform plans to delete.
Then:
```bash
terraform destroy
```
When Terraform asks:
Do you really want to destroy all resources?
Type:
```bash
yes
```
Terraform will attempt to remove the resources recorded in its state.

Important: If your Terraform configuration also manages the EC2 instance you are connected to, destroying it may terminate your SSH session. In that case, run Terraform from 

your separate runner EC2 or another management machine with access to the same Terraform state.

I got error to delete ecr repositories

```bash
cd ~/multi-svc-ecommrce-app-cicd/terraform
terraform destroy
yes

```
still not deleted ecr repositories
```bash
aws sts get-caller-identity
```
### 43.6 -- Verify the repositories
```bash
aws ecr describe-repositories \
  --region eu-north-1 \
  --query 'repositories[].repositoryName' \
  --output table
```
You should find these five repositories:
| • | ecommerce/frontend |
| --- | --- |
| • | ecommerce/api-gateway |
| • | ecommerce/user-service |
| • | ecommerce/product-service |
| • | ecommerce/order-service |
### 43.7 -- Force-delete the repositories

Warning: The following commands permanently delete all Docker images stored in these five repositories.

Copy and execute this entire block:

for repo in \
  ecommerce/frontend \
  ecommerce/api-gateway \
  ecommerce/user-service \
  ecommerce/product-service \
  ecommerce/order-service
do
```bash
  echo "Deleting ECR repository: $repo"

  aws ecr delete-repository \
    --repository-name "$repo" \
    --region eu-north-1 \
    --force \
    --query 'repository.repositoryName' \
    --output text

done


```
AWS CLI's --force option allows deletion of repositories even when they contain images.
You should see the five repository names printed if all deletions succeed.
### 43.8 -- Verify ECR cleanup
Run:
```bash
aws ecr describe-repositories \
  --region eu-north-1 \
  --query 'repositories[].repositoryName' \
  --output table
```
The five Ecommerce repositories should no longer appear.

```bash
terraform state list
```
Some ECR resources may still appear in Terraform state even though they have already been deleted from AWS. This is normal until Terraform refreshes its state.
### 43.9 -- Validate Terraform
```bash
terraform fmt
terraform validate
```
### 43.10 -- Review the remaining destroy plan
```bash
terraform plan -destroy
```
Verify that the planned deletions belong to your Ecommerce project.
### 43.11 --  Run Terraform destroy again
```bash
terraform destroy
```
Enter yes when prompted.
Terraform should recognize that the ECR repositories have already been removed and continue deleting the remaining managed resources.
43.12 — Verify Terraform cleanup
After terraform destroy finishes, run:
```bash
terraform state list
```
If everything Terraform manages has been deleted, this command should produce no output.
Then verify the EKS cluster:
```bash
aws eks list-clusters --region eu-north-1

```
check all are deleted or not in aws console login
terminate the server and runner ec2 in browser


This project demonstrates an end-to-end DevSecOps implementation for an Ecommerce microservices application on AWS EKS. I automated the CI/CD pipeline using GitHub Actions with a self-hosted runner, integrated SonarQube for code quality analysis and Trivy for vulnerability scanning, and used Docker and Amazon ECR for container image management.
I provisioned the AWS infrastructure using Terraform and implemented GitOps-based deployment using Argo CD. The application runs on Kubernetes with five application components and PostgreSQL databases.
For observability, I implemented Prometheus for metrics collection, Grafana for dashboards and Alertmanager for alert management. I also configured Grafana Alloy and Loki for centralized Kubernetes application logging, allowing service logs to be queried through Grafana.
Finally, I documented the infrastructure cleanup process to avoid unnecessary AWS resource costs after completing the demonstration.

