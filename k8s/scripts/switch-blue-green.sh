#!/bin/bash
NAMESPACE=$1
NEW_ENV=$2  # blue or green
OLD_ENV=$3  # green or blue
IMAGE_TAG=$4  # SHORT_SHA

# Deploy new image to inactive environment
kubectl -n $NAMESPACE set image deployment/receipt-frontend-$NEW_ENV receipt-frontend=venkatakurathitud/receipt-frontend:$IMAGE_TAG

# Scale up inactive environment
kubectl -n $NAMESPACE scale deployment/receipt-frontend-$NEW_ENV --replicas=1

# Wait for readiness
kubectl -n $NAMESPACE wait --for=condition=available deployment/receipt-frontend-$NEW_ENV --timeout=300s || {
  echo "Deployment not ready"
  kubectl -n $NAMESPACE describe deployment/receipt-frontend-$NEW_ENV
  exit 1
}

# Switch service selector
kubectl -n $NAMESPACE patch service receipt-frontend-service -p "{\"spec\":{\"selector\":{\"app\":\"receipt-frontend\",\"env\":\"$NEW_ENV\"}}}"

# Scale down active environment
kubectl -n $NAMESPACE scale deployment/receipt-frontend-$OLD_ENV --replicas=0

echo "Switched $NAMESPACE to $NEW_ENV environment"