import { V1DaemonSet, V1DaemonSetList } from '@kubernetes/client-node';
import { deleteWorkload } from './workload';
import { WorkloadKind } from '../../types';
import { FALSY_WORKLOAD_NAME_MARKER } from './types';
import { IncomingMessage } from 'http';
import { k8sApi } from '../../cluster';
import { paginatedClusterList, paginatedNamespacedList } from './pagination';
import {
  deleteWorkloadAlreadyScanned,
  deleteWorkloadImagesAlreadyScanned,
  kubernetesObjectToWorkloadAlreadyScanned,
} from '../../../state';
import { trimWorkload } from '../../workload-sanitization';

export async function paginatedNamespacedDaemonSetList(
  namespace: string,
): Promise<{
  response: IncomingMessage;
  body: V1DaemonSetList;
}> {
  const v1DaemonSetList = new V1DaemonSetList();
  v1DaemonSetList.apiVersion = 'apps/v1';
  v1DaemonSetList.kind = 'DaemonSetList';
  v1DaemonSetList.items = new Array<V1DaemonSet>();

  return await paginatedNamespacedList(
    namespace,
    v1DaemonSetList,
    k8sApi.appsClient.listNamespacedDaemonSet.bind(k8sApi.appsClient),
  );
}

export async function paginatedClusterDaemonSetList(): Promise<{
  response: IncomingMessage;
  body: V1DaemonSetList;
}> {
  const v1DaemonSetList = new V1DaemonSetList();
  v1DaemonSetList.apiVersion = 'apps/v1';
  v1DaemonSetList.kind = 'DaemonSetList';
  v1DaemonSetList.items = new Array<V1DaemonSet>();

  return await paginatedClusterList(
    v1DaemonSetList,
    k8sApi.appsClient.listDaemonSetForAllNamespaces.bind(k8sApi.appsClient),
  );
}

export async function daemonSetWatchHandler(
  daemonSet: V1DaemonSet,
): Promise<void> {
  daemonSet = trimWorkload(daemonSet);

  if (
    !daemonSet.metadata ||
    !daemonSet.spec ||
    !daemonSet.spec.template.metadata ||
    !daemonSet.spec.template.spec ||
    !daemonSet.status
  ) {
    return;
  }

  const workloadAlreadyScanned =
    kubernetesObjectToWorkloadAlreadyScanned(daemonSet);
  if (workloadAlreadyScanned !== undefined) {
    await Promise.all([
      deleteWorkloadAlreadyScanned(workloadAlreadyScanned),
      deleteWorkloadImagesAlreadyScanned({
        ...workloadAlreadyScanned,
        imageIds: daemonSet.spec.template.spec.containers
          .filter((container) => container.image !== undefined)
          .map((container) => container.image!),
      }),
    ]);
  }

  const workloadName = daemonSet.metadata.name || FALSY_WORKLOAD_NAME_MARKER;

  await deleteWorkload(
    {
      kind: WorkloadKind.DaemonSet,
      objectMeta: daemonSet.metadata,
      specMeta: daemonSet.spec.template.metadata,
      ownerRefs: daemonSet.metadata.ownerReferences,
      revision: daemonSet.status.observedGeneration,
      podSpec: daemonSet.spec.template.spec,
    },
    workloadName,
  );
}
