#!/bin/bash
NAMESPACE=$1
NEW_ENV=$2  # blue or green (the environment to switch TO)
OLD_ENV=$3  # green or blue (the environment to switch FROM)
IMAGE_TAG=$4 # SHORT_SHA (for logging)

echo "--- Starting switch-blue-green.sh script ---"
echo "NAMESPACE: $NAMESPACE"
echo "NEW_ENV (Switching to): $NEW_ENV"
echo "OLD_ENV (Switching from): $OLD_ENV"
echo "IMAGE_TAG: $IMAGE_TAG"

# Check if deployments exist
echo "Checking if deployments exist..."
kubectl -n $NAMESPACE get deployment receipt-frontend-$NEW_ENV || { echo "ERROR: Deployment receipt-frontend-$NEW_ENV not found!"; exit 1; }
kubectl -n $NAMESPACE get deployment receipt-frontend-$OLD_ENV || { echo "ERROR: Deployment receipt-frontend-$OLD_ENV not found!"; exit 1; }
echo "Deployments found."

# Ensure new environment is scaled up
echo "Ensuring deployment/receipt-frontend-$NEW_ENV is scaled up..."
kubectl scale deployment/receipt-frontend-$NEW_ENV --replicas=1 -n $NAMESPACE || {
  echo "ERROR: Failed to scale up deployment receipt-frontend-$NEW_ENV!"
  exit 1
}

# Wait for new environment pod to be ready
echo "Waiting for pod to be ready for env=$NEW_ENV..."
kubectl wait --for=condition=ready pod -l app=receipt-frontend,env=$NEW_ENV -n $NAMESPACE --timeout=300s || {
  echo "ERROR: No ready pods found for env=$NEW_ENV!"
  kubectl get pods -l app=receipt-frontend,env=$NEW_ENV -n $NAMESPACE -o wide
  exit 1
}

# Switch service selector
echo "Patching service receipt-frontend-service selector to env: $NEW_ENV"
kubectl -n $NAMESPACE patch service receipt-frontend-service -p "{\"spec\":{\"selector\":{\"app\":\"receipt-frontend\",\"env\":\"$NEW_ENV\"}}}" || {
  echo "ERROR: Failed to patch service selector!"
  kubectl get service receipt-frontend-service -n $NAMESPACE -o yaml
  exit 1
}
echo "Service selector updated."

# Verify service selector
echo "Verifying service selector..."
UPDATED_SELECTOR=$(kubectl get service receipt-frontend-service -n $NAMESPACE -o jsonpath='{.spec.selector.env}')
if [ "$UPDATED_SELECTOR" = "$NEW_ENV" ]; then
  echo "Service selector set to env=$NEW_ENV"
else
  echo "ERROR: Service selector verification failed. Expected env=$NEW_ENV, found env=$UPDATED_SELECTOR"
  exit 1
fi

# Wait for service endpoints to be ready
echo "Waiting for service receipt-frontend-service to have endpoints for env=$NEW_ENV..."
for i in {1..30}; do
  ENDPOINTS=$(kubectl get endpoints receipt-frontend-service -n $NAMESPACE -o jsonpath='{.subsets[0].addresses}' 2>/dev/null)
  if [ -n "$ENDPOINTS" ]; then
    echo "✅ Service endpoints ready: $ENDPOINTS"
    break
  elif [ "$i" -eq 30 ]; then
    echo "ERROR: Service endpoints not ready after 30 attempts."
    kubectl describe service receipt-frontend-service -n $NAMESPACE
    exit 1
  else
    echo "⌛ Waiting for endpoints (attempt $i/30)..."
    sleep 10
  fi
done

# Scale down old environment
echo "Scaling down old environment ($OLD_ENV) deployment to 0 replicas"
kubectl -n $NAMESPACE scale deployment/receipt-frontend-$OLD_ENV --replicas=0 || {
  echo "Warning: Failed to scale down old deployment receipt-frontend-$OLD_ENV."
}
echo "Old environment scaled down."

echo "--- switch-blue-green.sh script finished ---"