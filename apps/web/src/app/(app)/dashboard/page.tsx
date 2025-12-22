"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  FolderKanban,
  Music,
  TrendingUp,
  Zap,
  Plus,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { projectsApi, billingApi } from "@/lib/api";
import { useProjectStore } from "@/lib/store";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const { setProjects } = useProjectStore();

  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsApi.list(),
  });

  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ["usage"],
    queryFn: () => billingApi.getUsage(),
  });

  useEffect(() => {
    if (projectsData?.projects) {
      setProjects(projectsData.projects);
    }
  }, [projectsData, setProjects]);

  const projects = projectsData?.projects || [];
  const usage = usageData?.usage;
  const recentProjects = projects.slice(0, 5);

  const stats = [
    {
      name: "Total Projects",
      value: projects.length,
      icon: FolderKanban,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      name: "Total Tracks",
      value: projects.reduce((acc, p) => acc + p.trackCount, 0),
      icon: Music,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      name: "Tracks This Month",
      value: usage?.tracksProcessed || 0,
      icon: TrendingUp,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      name: "Processing Credits",
      value: usage ? `${Math.max(0, usage.tracksLimit - usage.tracksProcessed)}` : "0",
      icon: Zap,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Welcome to your audio mastering workspace
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.name}
              </CardTitle>
              <div className={`rounded-full p-2 ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              {projectsLoading || usageLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stat.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Usage and Recent Projects */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Usage Card */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Usage</CardTitle>
            <CardDescription>
              Your processing credits for this billing period
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {usageLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : usage ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Tracks Processed</span>
                    <span className="font-medium">
                      {usage.tracksProcessed} / {usage.tracksLimit}
                    </span>
                  </div>
                  <Progress
                    value={usage.tracksLimit > 0 ? (usage.tracksProcessed / usage.tracksLimit) * 100 : 0}
                    className="h-2"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Storage Used</span>
                    <span className="font-medium">
                      {(usage.storageUsed / 1024 / 1024 / 1024).toFixed(1)} GB /{" "}
                      {usage.storageLimit} GB
                    </span>
                  </div>
                  <Progress
                    value={
                      usage.storageLimit > 0
                        ? (usage.storageUsed / 1024 / 1024 / 1024 / usage.storageLimit) * 100
                        : 0
                    }
                    className="h-2"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Resets on {formatDate(usage.periodEnd)}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No usage data available
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Projects */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Projects</CardTitle>
              <CardDescription>Your latest audio projects</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/projects">
                View all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {projectsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentProjects.length > 0 ? (
              <div className="space-y-4">
                {recentProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center gap-4 rounded-lg p-2 transition-colors hover:bg-accent"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10">
                      <FolderKanban className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {project.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {project.trackCount} tracks
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {formatDate(project.updatedAt)}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FolderKanban className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No projects yet. Create your first project to get started.
                </p>
                <Button className="mt-4" asChild>
                  <Link href="/projects/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Project
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common tasks to help you get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" className="h-auto flex-col gap-2 p-4" asChild>
              <Link href="/projects/new">
                <Plus className="h-6 w-6" />
                <span>New Project</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 p-4" asChild>
              <Link href="/tracks">
                <Music className="h-6 w-6" />
                <span>Upload Track</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 p-4" asChild>
              <Link href="/billing">
                <Zap className="h-6 w-6" />
                <span>Upgrade Plan</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 p-4" asChild>
              <Link href="/settings">
                <TrendingUp className="h-6 w-6" />
                <span>View Settings</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
