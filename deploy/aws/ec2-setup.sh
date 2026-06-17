#!/usr/bin/env bash
# Run once on a fresh Ubuntu 22.04/24.04 EC2 instance (as ubuntu or ec2-user with sudo).
set -euo pipefail

echo "==> Installing Docker..."
sudo apt-get update -qq
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" |
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update -qq
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER"

echo "==> Docker installed. Log out and SSH back in so 'docker' works without sudo."
echo ""
echo "Next steps:"
echo "  cp deploy/aws/.env.production.example api/.env && nano api/.env"
echo "  ./deploy/aws/deploy.sh http"
echo ""
echo "Full guide: deploy/aws/README.md"
