import { SkeletonDashboard } from "@/components/shared/loading-skeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pb-24 pt-10 md:px-8" aria-busy="true">
      <SkeletonDashboard />
    </div>
  );
}
