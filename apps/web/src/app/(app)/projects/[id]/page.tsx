"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import {
  ArrowLeft,
  Upload,
  Music,
  MoreVertical,
  Play,
  Pause,
  Trash2,
  Wand2,
  Download,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { projectsApi, tracksApi, type Track } from "@/lib/api";
import { formatBytes, formatDuration, cn } from "@/lib/utils";
import { TrackDetailDialog } from "@/components/tracks/track-detail-dialog";
import { ProcessTrackDialog } from "@/components/tracks/process-track-dialog";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.id as string;

  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [processTrack, setProcessTrack] = useState<Track | null>(null);
  const [deleteTrack, setDeleteTrack] = useState<Track | null>(null);
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);

  const { data: projectData, isLoading: projectLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsApi.get(projectId),
  });

  const { data: tracksData, isLoading: tracksLoading } = useQuery({
    queryKey: ["tracks", projectId],
    queryFn: () => tracksApi.list(projectId),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return tracksApi.upload(projectId, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast.success("Track uploaded successfully");
    },
    onError: () => {
      toast.error("Failed to upload track");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (trackId: string) => tracksApi.delete(projectId, trackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast.success("Track deleted successfully");
      setDeleteTrack(null);
    },
    onError: () => {
      toast.error("Failed to delete track");
    },
  });

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      acceptedFiles.forEach((file) => {
        uploadMutation.mutate(file);
      });
    },
    [uploadMutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/*": [".wav", ".mp3", ".flac", ".aac", ".ogg", ".m4a"],
    },
    multiple: true,
  });

  const project = projectData?.project;
  const tracks = tracksData?.tracks || [];

  const getStatusBadge = (status: Track["status"]) => {
    switch (status) {
      case "ready":
        return <Badge variant="success">Ready</Badge>;
      case "processing":
        return <Badge variant="default">Processing</Badge>;
      case "analyzing":
        return <Badge variant="secondary">Analyzing</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  if (projectLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">Project not found</h2>
        <p className="mb-4 text-muted-foreground">
          The project you're looking for doesn't exist or you don't have access.
        </p>
        <Button onClick={() => router.push("/projects")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/projects")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{project.name}</h2>
            <p className="text-muted-foreground">
              {project.description || "No description"}
            </p>
          </div>
        </div>
      </div>

      {/* Upload Area */}
      <Card>
        <CardContent className="p-6">
          <div
            {...getRootProps()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors",
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            )}
          >
            <input {...getInputProps()} />
            <Upload
              className={cn(
                "mb-4 h-12 w-12",
                isDragActive ? "text-primary" : "text-muted-foreground"
              )}
            />
            {isDragActive ? (
              <p className="text-lg font-medium text-primary">
                Drop your audio files here...
              </p>
            ) : (
              <>
                <p className="text-lg font-medium">
                  Drag & drop audio files here
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  or click to browse (WAV, MP3, FLAC, AAC, OGG, M4A)
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tracks List */}
      <Card>
        <CardHeader>
          <CardTitle>Tracks ({tracks.length})</CardTitle>
          <CardDescription>
            Manage and process your audio tracks
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tracksLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : tracks.length > 0 ? (
            <div className="space-y-4">
              {tracks.map((track) => (
                <div
                  key={track.id}
                  className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent/50"
                >
                  {/* Play Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    disabled={track.status !== "ready"}
                    onClick={() =>
                      setPlayingTrack(
                        playingTrack === track.id ? null : track.id
                      )
                    }
                  >
                    {playingTrack === track.id ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>

                  {/* Track Info */}
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => setSelectedTrack(track)}
                  >
                    <div className="flex items-center gap-2">
                      <Music className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{track.name}</span>
                      {getStatusBadge(track.status)}
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{formatDuration(track.duration)}</span>
                      <span>{formatBytes(track.fileSize)}</span>
                      <span>
                        {track.sampleRate / 1000}kHz / {track.bitDepth}bit
                      </span>
                    </div>
                  </div>

                  {/* Analysis Summary */}
                  {track.analysis && (
                    <div className="hidden items-center gap-4 text-sm lg:flex">
                      <div className="text-center">
                        <div className="font-medium">
                          {track.analysis.lufs.toFixed(1)} LUFS
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Loudness
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium">
                          {track.analysis.truePeak.toFixed(1)} dB
                        </div>
                        <div className="text-xs text-muted-foreground">
                          True Peak
                        </div>
                      </div>
                      {track.analysis.issues.length > 0 && (
                        <Badge variant="warning">
                          {track.analysis.issues.length} issues
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setSelectedTrack(track)}
                      >
                        <Music className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setProcessTrack(track)}
                        disabled={track.status !== "ready"}
                      >
                        <Wand2 className="mr-2 h-4 w-4" />
                        Process
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={track.status !== "ready"}>
                        <Download className="mr-2 h-4 w-4" />
                        Export
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteTrack(track)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Music className="mb-4 h-16 w-16 text-muted-foreground/50" />
              <h3 className="mb-2 text-lg font-semibold">No tracks yet</h3>
              <p className="text-muted-foreground">
                Upload your first audio track to get started.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Track Detail Dialog */}
      <TrackDetailDialog
        track={selectedTrack}
        projectId={projectId}
        open={!!selectedTrack}
        onOpenChange={(open) => !open && setSelectedTrack(null)}
      />

      {/* Process Track Dialog */}
      <ProcessTrackDialog
        track={processTrack}
        projectId={projectId}
        open={!!processTrack}
        onOpenChange={(open) => !open && setProcessTrack(null)}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteTrack}
        onOpenChange={(open) => !open && setDeleteTrack(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Track</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTrack?.name}"? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTrack && deleteMutation.mutate(deleteTrack.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
