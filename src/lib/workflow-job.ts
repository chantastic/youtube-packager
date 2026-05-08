export type WorkflowJobLike =
	| {
			status?: string | null;
			error?: string | null;
			queuedAt?: number | null;
			startedAt?: number | null;
			completedAt?: number | null;
	  }
	| null
	| undefined;

export function workflowJobIsActive(job: WorkflowJobLike) {
	return job?.status === 'queued' || job?.status === 'running';
}

export function workflowJobLabel(job: WorkflowJobLike) {
	if (!job) return 'No job';
	if (job.status === 'queued') return 'Queued';
	if (job.status === 'running') return 'Running';
	if (job.status === 'complete') return 'Complete';
	if (job.status === 'error') return 'Error';
	return 'Unknown';
}

export function workflowJobToneClass(job: WorkflowJobLike) {
	if (!job) return 'border-gray-200 bg-gray-50 text-gray-600';
	if (job.status === 'complete') return 'border-green-200 bg-green-50 text-green-700';
	if (job.status === 'error') return 'border-amber-200 bg-amber-50 text-amber-800';
	if (workflowJobIsActive(job)) return 'border-blue-200 bg-blue-50 text-blue-700';
	return 'border-gray-200 bg-gray-50 text-gray-600';
}

export function workflowJobTimestamp(job: WorkflowJobLike) {
	if (!job) return null;

	if (job.completedAt) {
		return { label: 'Completed', value: job.completedAt };
	}

	if (job.startedAt) {
		return { label: 'Started', value: job.startedAt };
	}

	if (job.queuedAt) {
		return { label: 'Queued', value: job.queuedAt };
	}

	return null;
}
