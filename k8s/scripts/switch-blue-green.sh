#!/bin/bash
NAMESPACE=$1
NEW_ENV=$2  # blue or green
OLD_ENV=$3  # green or blue
# IMAGE_TAG=$4  # No longer needed in the script

# Fail fast if deployments don't exist (Good check to keep)
kubectl -n $NAMESPACE get deployment receipt-frontend-$NEW_ENV || exit 1
kubectl -n $NAMESPACE get deployment receipt-frontend-$OLD_ENV || exit 1

# --- Redundant steps removed ---
# kubectl -n $NAMESPACE set image deployment/receipt-frontend-$NEW_ENV receipt-frontend=venkatakurathitud/receipt-frontend:$IMAGE_TAG
# kubectl -n $NAMESPACE scale deployment/receipt-frontend-$NEW_ENV --replicas=1
# kubectl -n $NAMESPACE rollout status deployment/receipt-frontend-$NEW_ENV --timeout=300s || { ... }
# --- End of redundant steps ---

# Switch service selector
echo "Switching service selector to env: $NEW_ENV"
kubectl -n $NAMESPACE patch service receipt-frontend-service -p "{\"spec\":{\"selector\":{\"env\":\"$NEW_ENV\"}}}" || {
  echo "ERROR: Failed to patch service selector"
  exit 1
}
echo "Service selector updated."

# Scale down old environment
echo "Scaling down old environment ($OLD_ENV) to 0 replicas"
kubectl -n $NAMESPACE scale deployment/receipt-frontend-$OLD_ENV --replicas=0 || {
  echo "Warning: Failed to scale down old deployment ($OLD_ENV). Manual intervention might be needed."
  # Don't exit here, as the switch already happened. Just warn.
}
echo "Old environment scaled down."

echo "SUCCESS: Switched $NAMESPACE traffic to $NEW_ENV environment"