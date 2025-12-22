"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Wand2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  tracksApi,
  type Track,
  type FixOptions,
  type MasterOptions,
} from "@/lib/api";

interface ProcessTrackDialogProps {
  track: Track | null;
  projectId: string;
  open: boolean;
  onOpenChange: (_open: boolean) => void;
}

const GENRES = [
  { value: "pop", label: "Pop" },
  { value: "rock", label: "Rock" },
  { value: "electronic", label: "Electronic" },
  { value: "hip-hop", label: "Hip-Hop" },
  { value: "jazz", label: "Jazz" },
  { value: "classical", label: "Classical" },
  { value: "rnb", label: "R&B" },
  { value: "country", label: "Country" },
  { value: "metal", label: "Metal" },
  { value: "acoustic", label: "Acoustic" },
];

export function ProcessTrackDialog({
  track,
  projectId,
  open,
  onOpenChange,
}: ProcessTrackDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"fix" | "master">("fix");

  // Fix options
  const [fixOptions, setFixOptions] = useState<FixOptions>({
    removeClipping: true,
    removeNoise: true,
    fixPhase: false,
    normalizeLevel: true,
  });

  // Master options
  const [masterOptions, setMasterOptions] = useState<MasterOptions>({
    targetLufs: -14,
    genre: "pop",
  });

  const fixMutation = useMutation({
    mutationFn: () => tracksApi.fix(projectId, track!.id, fixOptions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracks", projectId] });
      toast.success("Processing started. You'll be notified when it's done.");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Failed to start processing");
    },
  });

  const masterMutation = useMutation({
    mutationFn: () => tracksApi.master(projectId, track!.id, masterOptions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracks", projectId] });
      toast.success("Mastering started. You'll be notified when it's done.");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Failed to start mastering");
    },
  });

  if (!track) return null;

  const isProcessing = fixMutation.isPending || masterMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Process Track</DialogTitle>
          <DialogDescription>
            Choose how you want to process "{track.name}"
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="fix" className="gap-2">
              <Wand2 className="h-4 w-4" />
              Fix Issues
            </TabsTrigger>
            <TabsTrigger value="master" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Master
            </TabsTrigger>
          </TabsList>

          {/* Fix Tab */}
          <TabsContent value="fix" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Automatically fix common audio issues in your track.
            </p>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Remove Clipping</Label>
                  <p className="text-xs text-muted-foreground">
                    Fix digital clipping and distortion
                  </p>
                </div>
                <Switch
                  checked={fixOptions.removeClipping}
                  onCheckedChange={(checked) =>
                    setFixOptions({ ...fixOptions, removeClipping: checked })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Remove Noise</Label>
                  <p className="text-xs text-muted-foreground">
                    Reduce background noise and hiss
                  </p>
                </div>
                <Switch
                  checked={fixOptions.removeNoise}
                  onCheckedChange={(checked) =>
                    setFixOptions({ ...fixOptions, removeNoise: checked })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Fix Phase Issues</Label>
                  <p className="text-xs text-muted-foreground">
                    Correct phase correlation problems
                  </p>
                </div>
                <Switch
                  checked={fixOptions.fixPhase}
                  onCheckedChange={(checked) =>
                    setFixOptions({ ...fixOptions, fixPhase: checked })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Normalize Level</Label>
                  <p className="text-xs text-muted-foreground">
                    Optimize peak levels
                  </p>
                </div>
                <Switch
                  checked={fixOptions.normalizeLevel}
                  onCheckedChange={(checked) =>
                    setFixOptions({ ...fixOptions, normalizeLevel: checked })
                  }
                />
              </div>
            </div>
          </TabsContent>

          {/* Master Tab */}
          <TabsContent value="master" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Apply AI-powered mastering to achieve professional sound.
            </p>
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Target Loudness</Label>
                  <span className="text-sm font-medium">
                    {masterOptions.targetLufs} LUFS
                  </span>
                </div>
                <Slider
                  value={[masterOptions.targetLufs || -14]}
                  onValueChange={([value]) =>
                    setMasterOptions({ ...masterOptions, targetLufs: value })
                  }
                  min={-24}
                  max={-6}
                  step={0.5}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>-24 LUFS (Quiet)</span>
                  <span>-6 LUFS (Loud)</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Genre Profile</Label>
                <Select
                  value={masterOptions.genre}
                  onValueChange={(value) =>
                    setMasterOptions({ ...masterOptions, genre: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select genre" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENRES.map((genre) => (
                      <SelectItem key={genre.value} value={genre.value}>
                        {genre.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The AI will optimize EQ and dynamics based on genre
                  characteristics
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={() =>
              activeTab === "fix"
                ? fixMutation.mutate()
                : masterMutation.mutate()
            }
            disabled={isProcessing}
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {activeTab === "fix" ? "Fix Issues" : "Start Mastering"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
