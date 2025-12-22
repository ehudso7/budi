"use client";

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { projectsApi, type Project } from "@/lib/api";
import { useProjectStore } from "@/lib/store";

const editProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100),
  description: z.string().max(500).optional(),
});

type EditProjectForm = z.infer<typeof editProjectSchema>;

interface EditProjectDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (_open: boolean) => void;
}

export function EditProjectDialog({
  project,
  open,
  onOpenChange,
}: EditProjectDialogProps) {
  const queryClient = useQueryClient();
  const { updateProject } = useProjectStore();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditProjectForm>({
    resolver: zodResolver(editProjectSchema),
  });

  useEffect(() => {
    if (project) {
      reset({
        name: project.name,
        description: project.description || "",
      });
    }
  }, [project, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: EditProjectForm) =>
      projectsApi.update(project!.id, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      updateProject(project!.id, response.project);
      toast.success("Project updated successfully");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Failed to update project");
    },
  });

  const onSubmit = (data: EditProjectForm) => {
    updateMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>
            Update your project details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Project Name</Label>
              <Input
                id="edit-name"
                placeholder="My New Album"
                {...register("name")}
                disabled={updateMutation.isPending}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description (optional)</Label>
              <Textarea
                id="edit-description"
                placeholder="Describe your project..."
                {...register("description")}
                disabled={updateMutation.isPending}
              />
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
