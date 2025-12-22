"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { tracksApi, type Track } from "@/lib/api";
import { formatBytes, formatDuration } from "@/lib/utils";

interface TrackDetailDialogProps {
  track: Track | null;
  projectId: string;
  open: boolean;
  onOpenChange: (_open: boolean) => void;
}

export function TrackDetailDialog({
  track,
  projectId,
  open,
  onOpenChange,
}: TrackDetailDialogProps) {
  const queryClient = useQueryClient();

  const analyzeMutation = useMutation({
    mutationFn: () => tracksApi.analyze(projectId, track!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracks", projectId] });
      toast.success("Analysis started");
    },
    onError: () => {
      toast.error("Failed to start analysis");
    },
  });

  if (!track) return null;

  const analysis = track.analysis;

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "high":
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case "medium":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{track.name}</DialogTitle>
          <DialogDescription>Track details and analysis</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="issues">Issues</TabsTrigger>
          </TabsList>

          {/* Details Tab */}
          <TabsContent value="details" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">File Name</p>
                <p className="font-medium">{track.originalFileName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Format</p>
                <p className="font-medium uppercase">{track.format}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="font-medium">{formatDuration(track.duration)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">File Size</p>
                <p className="font-medium">{formatBytes(track.fileSize)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Sample Rate</p>
                <p className="font-medium">{track.sampleRate / 1000} kHz</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Bit Depth</p>
                <p className="font-medium">{track.bitDepth} bit</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Channels</p>
                <p className="font-medium">
                  {track.channels === 1 ? "Mono" : "Stereo"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge
                  variant={
                    track.status === "ready"
                      ? "success"
                      : track.status === "error"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {track.status}
                </Badge>
              </div>
            </div>
          </TabsContent>

          {/* Analysis Tab */}
          <TabsContent value="analysis" className="space-y-4">
            {!analysis ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="mb-4 text-muted-foreground">
                  No analysis data available. Run analysis to get detailed
                  information about your track.
                </p>
                <Button
                  onClick={() => analyzeMutation.mutate()}
                  disabled={
                    analyzeMutation.isPending || track.status !== "ready"
                  }
                >
                  {analyzeMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Analyze Track
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Loudness Metrics */}
                <div>
                  <h4 className="mb-3 font-medium">Loudness Metrics</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-2xl font-bold">
                        {analysis.lufs.toFixed(1)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        LUFS (Integrated)
                      </p>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-2xl font-bold">
                        {analysis.truePeak.toFixed(1)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        True Peak (dB)
                      </p>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-2xl font-bold">
                        {analysis.dynamicRange.toFixed(1)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Dynamic Range (LU)
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Spectral Analysis */}
                <div>
                  <h4 className="mb-3 font-medium">Spectral Balance</h4>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Low End (20-200Hz)</span>
                        <span>
                          {(analysis.spectralAnalysis.lowEnd * 100).toFixed(0)}%
                        </span>
                      </div>
                      <Progress
                        value={analysis.spectralAnalysis.lowEnd * 100}
                        className="h-2"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Mid Range (200Hz-4kHz)</span>
                        <span>
                          {(analysis.spectralAnalysis.midRange * 100).toFixed(
                            0
                          )}
                          %
                        </span>
                      </div>
                      <Progress
                        value={analysis.spectralAnalysis.midRange * 100}
                        className="h-2"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>High End (4kHz-20kHz)</span>
                        <span>
                          {(analysis.spectralAnalysis.highEnd * 100).toFixed(0)}
                          %
                        </span>
                      </div>
                      <Progress
                        value={analysis.spectralAnalysis.highEnd * 100}
                        className="h-2"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Issues Tab */}
          <TabsContent value="issues" className="space-y-4">
            {!analysis ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="mb-4 text-muted-foreground">
                  Run analysis to detect potential issues in your track.
                </p>
                <Button
                  onClick={() => analyzeMutation.mutate()}
                  disabled={
                    analyzeMutation.isPending || track.status !== "ready"
                  }
                >
                  {analyzeMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Analyze Track
                </Button>
              </div>
            ) : analysis.issues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle className="mb-4 h-12 w-12 text-green-500" />
                <p className="text-lg font-medium">No issues detected</p>
                <p className="text-muted-foreground">
                  Your track looks great!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {analysis.issues.map((issue, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 rounded-lg border p-4"
                  >
                    {getSeverityIcon(issue.severity)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{issue.type}</p>
                        <Badge
                          variant={
                            issue.severity === "high"
                              ? "destructive"
                              : issue.severity === "medium"
                              ? "warning"
                              : "secondary"
                          }
                        >
                          {issue.severity}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {issue.description}
                      </p>
                      {issue.timestamp !== undefined && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          At {formatDuration(issue.timestamp)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
