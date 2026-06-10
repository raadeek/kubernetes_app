# Task Manager - Kubernetes i monitoring

Projekt zawiera aplikacje Task Manager oraz manifesty Kubernetes dla backendu,
frontendu, PostgreSQL, Ingressu i monitoringu opartego na
`kube-prometheus-stack`.

## Wymagania

- Docker Desktop
- kubectl
- kind
- Helm

## Uruchomienie lokalnego klastra kind

```powershell
kind create cluster --name zad5-monitoring --config .github/kind-config.yaml
```

## Zbudowanie i zaladowanie obrazow aplikacji

```powershell
docker build -t task-manager-backend:v1.0.0 app/backend
docker build -t task-manager-backend:v2.0.0 app/backend
docker build -t task-manager-frontend:1.0.0 app/frontend

kind load docker-image task-manager-backend:v1.0.0 --name zad5-monitoring
kind load docker-image task-manager-backend:v2.0.0 --name zad5-monitoring
kind load docker-image task-manager-frontend:1.0.0 --name zad5-monitoring
```

## Wdrozenie Task Managera

```powershell
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/backend/
kubectl apply -f k8s/frontend/

kubectl rollout status deployment/postgres -n zad4 --timeout=180s
kubectl rollout status deployment/backend-blue -n zad4 --timeout=180s
kubectl rollout status deployment/backend-green -n zad4 --timeout=180s
kubectl rollout status deployment/frontend -n zad4 --timeout=180s
```

Sprawdzenie aplikacji przez Service:

```powershell
kubectl port-forward service/backend-service -n zad4 8080:8080
curl http://localhost:8080/health
curl http://localhost:8080/tasks
```

## Instalacja monitoringu przez Helm

Dodanie repozytorium chartow:

```powershell
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

Instalacja `kube-prometheus-stack` w dedykowanym namespace:

```powershell
kubectl create namespace monitoring

helm install monitoring prometheus-community/kube-prometheus-stack `
  --namespace monitoring `
  --values k8s/monitoring/values.yaml
```

Weryfikacja instalacji:

```powershell
helm list -n monitoring
kubectl get pods -n monitoring
kubectl get services -n monitoring
```

## Dostep do Grafany

```powershell
kubectl port-forward -n monitoring service/monitoring-grafana 3000:80
```

Grafana jest dostepna pod adresem `http://localhost:3000`.

- login: `admin`
- haslo: `admin123`

Konfiguracja laboratoryjna pozwala rowniez na anonimowy dostep tylko do
odczytu. Ulatwia to prezentacje dashboardow bez udostepniania uprawnien
administratora.

W Grafanie mozna uzyc wbudowanego dashboardu
`Kubernetes / Compute Resources / Namespace (Pods)` i wybrac namespace `zad4`.
Dashboard pokazuje zuzycie CPU i RAM przez backend, frontend i PostgreSQL.

## Dostep do Prometheusa

```powershell
kubectl port-forward -n monitoring service/monitoring-kube-prometheus-prometheus 9090:9090
```

Prometheus jest dostepny pod adresem `http://localhost:9090`. Przykladowe
zapytania PromQL:

```promql
kube_pod_status_phase{namespace="zad4"}
```

```promql
rate(container_cpu_usage_seconds_total{namespace="zad4",pod=~"backend.*"}[5m])
```

```promql
container_memory_working_set_bytes{namespace="zad4",container!=""}
```

Monitorowane endpointy mozna sprawdzic w Prometheusie w zakladce
`Status -> Target health`.

W pliku `k8s/monitoring/values.yaml` wylaczone sa targety control plane
(`kubeControllerManager`, `kubeEtcd`, `kubeProxy`, `kubeScheduler`). W klastrze
kind nasluchuja one tylko na localhost wezla i nie sa osiagalne z Poda
Prometheusa.

## Usuniecie monitoringu

```powershell
helm uninstall monitoring -n monitoring
kubectl delete namespace monitoring
```
