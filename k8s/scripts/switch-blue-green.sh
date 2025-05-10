#!/bin/bash
NAMESPACE=$1
NEW_ENV=$2  # blue or green (the environment to switch TO)
OLD_ENV=$3  # green or blue (the environment to switch FROM)
IMAGE_TAG=$4 # SHORT_SHA (passed from workflow, though not used in the switch itself)

echo "--- Starting switch-blue-green.sh script ---"
echo "NAMESPACE: $NAMESPACE"
echo "NEW_ENV (Switching to): $NEW_ENV"
echo "OLD_ENV (Switching from): $OLD_ENV"
echo "IMAGE_TAG: $IMAGE_TAG" # Just for visibility

# Fail fast if deployments don't exist (Good check to keep)
echo "Checking if deployments exist..."
kubectl -n $NAMESPACE get deployment receipt-frontend-$NEW_ENV || { echo "ERROR: Deployment receipt-frontend-$NEW_ENV not found!"; exit 1; }
kubectl -n $NAMESPACE get deployment receipt-frontend-$OLD_ENV || { echo "ERROR: Deployment receipt-frontend-$OLD_ENV not found!"; exit 1; }
echo "Deployments found."

# --- Redundant steps removed as per previous discussion ---
# These steps are handled by the workflow before calling this script.
# kubectl -n $NAMESPACE set image deployment/receipt-frontend-$NEW_ENV receipt-frontend=venkatakurathitud/receipt-frontend:$IMAGE_TAG
# kubectl -n $NAMESPACE scale deployment/receipt-frontend-$NEW_ENV --replicas=1
# kubectl -n $NAMESPACE rollout status deployment/receipt-frontend-$NEW_ENV --timeout=300s || { ... }
# --- End of redundant steps ---

# Switch service selector
echo "Attempting to patch service receipt-frontend-service selector to env: $NEW_ENV"
kubectl -n $NAMESPACE patch service receipt-frontend-service -p "{\"spec\":{\"selector\":{\"env\":\"$NEW_ENV\"}}}" || {
  echo "ERROR: Failed to patch service selector for receipt-frontend-service in namespace $NAMESPACE!"
  # Print service details for debugging
  echo "--- Current Service Details ---"
  kubectl get service receipt-frontend-service -n $NAMESPACE -o yaml
  echo "--- End Current Service Details ---"
  exit 1 # Exit on failure to patch service
}
echo "Service selector updated successfully."

# Verify service selector update (Optional but helpful)
echo "Verifying service selector after patch..."
UPDATED_SELECTOR=$(kubectl get service receipt-frontend-service -n $NAMESPACE -o jsonpath='{.spec.selector.env}')
if [ "$UPDATED_SELECTOR" = "$NEW_ENV" ]; then
  echo "Service selector successfully set to env=$NEW_ENV"
else
  echo "Warning: Service selector verification failed. Expected env=$NEW_ENV, but found env=$UPDATED_SELECTOR"
  # Do not exit here, as the patch command itself might have succeeded,
  # but the subsequent get command was too fast or hit a cache.
fi


# Scale down old environment
echo "Scaling down old environment ($OLD_ENV) deployment to 0 replicas"
kubectl -n $NAMESPACE scale deployment/receipt-frontend-$OLD_ENV --replicas=0 || {
  echo "Warning: Failed to scale down old deployment receipt-frontend-$OLD_ENV. Manual intervention might be needed."
  # Do not exit here, as the traffic switch already happened. Just warn.
}
echo "Old environment scaled down."

echo "--- switch-blue-green.sh script finished ---"
