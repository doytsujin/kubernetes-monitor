import { IncomingMessage } from 'http';
import { deleteWorkload } from './workload';
import { WorkloadKind } from '../../types';
import {
  FALSY_WORKLOAD_NAME_MARKER,
  V1DeploymentConfig,
  V1DeploymentConfigList,
} from './types';
import { paginatedClusterList, paginatedNamespacedList } from './pagination';
import { k8sApi } from '../../cluster';
import {
  deleteWorkloadAlreadyScanned,
  deleteWorkloadImagesAlreadyScanned,
  kubernetesObjectToWorkloadAlreadyScanned,
} from '../../../state';
import { retryKubernetesApiRequest } from '../../kuberenetes-api-wrappers';
import { logger } from '../../../common/logger';

export async function paginatedNamespacedDeploymentConfigList(
  namespace: string,
): Promise<{
  response: IncomingMessage;
  body: V1DeploymentConfigList;
}> {
  const v1DeploymentConfigList = new V1DeploymentConfigList();
  v1DeploymentConfigList.apiVersion = 'apps.openshift.io/v1';
  v1DeploymentConfigList.kind = 'DeploymentConfigList';
  v1DeploymentConfigList.items = new Array<V1DeploymentConfig>();

  return await paginatedNamespacedList(
    namespace,
    v1DeploymentConfigList,
    async (
      namespace: string,
      pretty?: string,
      _allowWatchBookmarks?: boolean,
      _continue?: string,
      fieldSelector?: string,
      labelSelector?: string,
      limit?: number,
    ) =>
      k8sApi.customObjectsClient.listNamespacedCustomObject(
        'apps.openshift.io',
        'v1',
        namespace,
        'deploymentconfigs',
        pretty,
        _continue,
        fieldSelector,
        labelSelector,
        limit,
        // TODO: Why any?
      ) as any,
  );
}

export async function paginatedClusterDeploymentConfigList(): Promise<{
  response: IncomingMessage;
  body: V1DeploymentConfigList;
}> {
  const v1DeploymentConfigList = new V1DeploymentConfigList();
  v1DeploymentConfigList.apiVersion = 'apps.openshift.io/v1';
  v1DeploymentConfigList.kind = 'DeploymentConfigList';
  v1DeploymentConfigList.items = new Array<V1DeploymentConfig>();

  return await paginatedClusterList(
    v1DeploymentConfigList,
    async (
      _allowWatchBookmarks?: boolean,
      _continue?: string,
      fieldSelector?: string,
      labelSelector?: string,
      limit?: number,
      pretty?: string,
    ) =>
      k8sApi.customObjectsClient.listClusterCustomObject(
        'apps.openshift.io',
        'v1',
        'deploymentconfigs',
        pretty,
        _continue,
        fieldSelector,
        labelSelector,
        limit,
      ) as any,
  );
}

export async function deploymentConfigWatchHandler(
  deploymentConfig: V1DeploymentConfig,
): Promise<void> {
  deploymentConfig = trimWorkload(deploymentConfig);

  if (
    !deploymentConfig.metadata ||
    !deploymentConfig.spec ||
    !deploymentConfig.spec.template.metadata ||
    !deploymentConfig.spec.template.spec ||
    !deploymentConfig.status
  ) {
    return;
  }

  const workloadAlreadyScanned =
    kubernetesObjectToWorkloadAlreadyScanned(deploymentConfig);
  if (workloadAlreadyScanned !== undefined) {
    await Promise.all([
      deleteWorkloadAlreadyScanned(workloadAlreadyScanned),
      deleteWorkloadImagesAlreadyScanned({
        ...workloadAlreadyScanned,
        imageIds: deploymentConfig.spec.template.spec.containers
          .filter((container) => container.image !== undefined)
          .map((container) => container.image!),
      }),
    ]);
  }

  const workloadName =
    deploymentConfig.metadata.name || FALSY_WORKLOAD_NAME_MARKER;

  await deleteWorkload(
    {
      kind: WorkloadKind.DeploymentConfig,
      objectMeta: deploymentConfig.metadata,
      specMeta: deploymentConfig.spec.template.metadata,
      ownerRefs: deploymentConfig.metadata.ownerReferences,
      revision: deploymentConfig.status.observedGeneration,
      podSpec: deploymentConfig.spec.template.spec,
    },
    workloadName,
  );
}

export async function isNamespacedDeploymentConfigSupported(
  namespace: string,
): Promise<boolean> {
  try {
    const pretty = undefined;
    const continueToken = undefined;
    const fieldSelector = undefined;
    const labelSelector = undefined;
    const limit = 1; // Try to grab only a single object
    const resourceVersion = undefined; // List anything in the cluster
    const timeoutSeconds = 10; // Don't block the snyk-monitor indefinitely
    const attemptedApiCall = await retryKubernetesApiRequest(() =>
      k8sApi.customObjectsClient.listNamespacedCustomObject(
        'apps.openshift.io',
        'v1',
        namespace,
        'deploymentconfigs',
        pretty,
        continueToken,
        fieldSelector,
        labelSelector,
        limit,
        resourceVersion,
        timeoutSeconds,
      ),
    );
    return (
      attemptedApiCall !== undefined &&
      attemptedApiCall.response !== undefined &&
      attemptedApiCall.response.statusCode !== undefined &&
      attemptedApiCall.response.statusCode >= 200 &&
      attemptedApiCall.response.statusCode < 300
    );
  } catch (error) {
    logger.debug(
      { error, workloadKind: WorkloadKind.DeploymentConfig },
      'Failed on Kubernetes API call to list namespaced DeploymentConfig',
    );
    return false;
  }
}

export async function isClusterDeploymentConfigSupported(): Promise<boolean> {
  try {
    const pretty = undefined;
    const continueToken = undefined;
    const fieldSelector = undefined;
    const labelSelector = undefined;
    const limit = 1; // Try to grab only a single object
    const resourceVersion = undefined; // List anything in the cluster
    const timeoutSeconds = 10; // Don't block the snyk-monitor indefinitely
    const attemptedApiCall = await retryKubernetesApiRequest(() =>
      k8sApi.customObjectsClient.listClusterCustomObject(
        'apps.openshift.io',
        'v1',
        'deploymentconfigs',
        pretty,
        continueToken,
        fieldSelector,
        labelSelector,
        limit,
        resourceVersion,
        timeoutSeconds,
      ),
    );
    return (
      attemptedApiCall !== undefined &&
      attemptedApiCall.response !== undefined &&
      attemptedApiCall.response.statusCode !== undefined &&
      attemptedApiCall.response.statusCode >= 200 &&
      attemptedApiCall.response.statusCode < 300
    );
  } catch (error) {
    logger.debug(
      { error, workloadKind: WorkloadKind.DeploymentConfig },
      'Failed on Kubernetes API call to list cluster DeploymentConfig',
    );
    return false;
  }
}
function trimWorkload(
  deploymentConfig: V1DeploymentConfig,
): V1DeploymentConfig {
  throw new Error('Function not implemented.');
}
