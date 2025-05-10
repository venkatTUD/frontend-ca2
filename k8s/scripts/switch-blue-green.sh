#!/bin/bash
NAMESPACE=$1
NEW_ENV=$2  # blue or green
OLD_ENV=$3  # green or blue
IMAGE_TAG=$4  # SHORT_SHA

# Fail fast if deployments don't exist
kubectl -n $NAMESPACE get deployment receipt-frontend-$NEW_ENV || exit 1
kubectl -n $NAMESPACE get deployment receipt-frontend-$OLD_ENV || exit 1

# Update image and scale up new environment
kubectl -n $NAMESPACE set image deployment/receipt-frontend-$NEW_ENV receipt-frontend=venkatakurathitud/receipt-frontend:$IMAGE_TAG
kubectl -n $NAMESPACE scale deployment/receipt-frontend-$NEW_ENV --replicas=1

# Wait for new deployment to be ready
kubectl -n $NAMESPACE rollout status deployment/receipt-frontend-$NEW_ENV --timeout=300s || {
  echo "ERROR: New deployment failed to become ready"
  kubectl -n $NAMESPACE describe deployment/receipt-frontend-$NEW_ENV
  kubectl -n $NAMESPACE logs -l app=receipt-frontend,env=$NEW_ENV --tail=50
  exit 1
}

# Switch service selector
kubectl -n $NAMESPACE patch service receipt-frontend-service -p "{\"spec\":{\"selector\":{\"env\":\"$NEW_ENV\"}}}"

# Scale down old environment
kubectl -n $NAMESPACE scale deployment/receipt-frontend-$OLD_ENV --replicas=0

echo "SUCCESS: Switched $NAMESPACE to $NEW_ENV environment"