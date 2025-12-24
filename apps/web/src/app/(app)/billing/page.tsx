"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Check,
  CreditCard,
  Loader2,
  Zap,
  Crown,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { billingApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

export default function BillingPage() {
  const { user } = useAuthStore();

  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => billingApi.getSubscription(),
  });

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: () => billingApi.getPlans(),
  });

  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ["usage"],
    queryFn: () => billingApi.getUsage(),
  });

  const checkoutMutation = useMutation({
    mutationFn: (priceId: string) => billingApi.createCheckout(priceId),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: () => {
      toast.error("Failed to create checkout session");
    },
  });

  const portalMutation = useMutation({
    mutationFn: () => billingApi.createPortal(),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: () => {
      toast.error("Failed to open billing portal");
    },
  });

  const subscription = subscriptionData?.subscription;
  const plans = plansData?.plans || [];
  const usage = usageData?.usage;

  const currentPlan = user?.subscription?.plan || "free";

  const getPlanIcon = (planName: string) => {
    switch (planName.toLowerCase()) {
      case "pro":
        return <Crown className="h-6 w-6" />;
      case "enterprise":
        return <Sparkles className="h-6 w-6" />;
      default:
        return <Zap className="h-6 w-6" />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Billing</h2>
        <p className="text-muted-foreground">
          Manage your subscription and billing
        </p>
      </div>

      {/* Current Subscription */}
      <Card>
        <CardHeader>
          <CardTitle>Current Subscription</CardTitle>
          <CardDescription>
            Your current plan and billing information
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptionLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : subscription ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  {getPlanIcon(subscription.plan)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold capitalize">
                      {subscription.plan}
                    </h3>
                    <Badge
                      variant={
                        subscription.status === "active"
                          ? "success"
                          : "secondary"
                      }
                    >
                      {subscription.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {subscription.cancelAtPeriodEnd
                      ? `Cancels on ${formatDate(subscription.currentPeriodEnd)}`
                      : `Renews on ${formatDate(subscription.currentPeriodEnd)}`}
                  </p>
                </div>
              </div>
              <Separator />
              <Button onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
                {portalMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                <CreditCard className="mr-2 h-4 w-4" />
                Manage Subscription
              </Button>
            </div>
          ) : (
            <div className="text-center py-8">
              <Zap className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Free Plan</h3>
              <p className="text-muted-foreground">
                You're currently on the free plan. Upgrade to unlock more features.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Usage This Period</CardTitle>
          <CardDescription>
            Your current usage for this billing period
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
                Period ends on {formatDate(usage.periodEnd)}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No usage data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Plans */}
      <div>
        <h3 className="mb-4 text-xl font-semibold">Available Plans</h3>
        {plansLoading ? (
          <div className="grid gap-6 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-8 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-32 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => {
              const isCurrentPlan =
                plan.name.toLowerCase() === currentPlan.toLowerCase();
              const isPopular = plan.name.toLowerCase() === "pro";

              return (
                <Card
                  key={plan.id}
                  className={cn(
                    "relative",
                    isPopular && "border-primary shadow-lg"
                  )}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary">Most Popular</Badge>
                    </div>
                  )}
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      {getPlanIcon(plan.name)}
                      <CardTitle className="capitalize">{plan.name}</CardTitle>
                    </div>
                    <CardDescription>
                      <span className="text-3xl font-bold text-foreground">
                        {formatCurrency(plan.price)}
                      </span>
                      <span className="text-muted-foreground">
                        /{plan.interval}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Separator className="my-4" />
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>{plan.limits.projects === -1 ? "Unlimited" : plan.limits.projects} projects</p>
                      <p>{plan.limits.tracksPerMonth === -1 ? "Unlimited" : plan.limits.tracksPerMonth} tracks/month</p>
                      <p>{plan.limits.storageGb} GB storage</p>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="w-full"
                      variant={isCurrentPlan ? "outline" : "default"}
                      disabled={isCurrentPlan || checkoutMutation.isPending}
                      onClick={() => checkoutMutation.mutate(plan.id)}
                    >
                      {checkoutMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {isCurrentPlan ? "Current Plan" : "Upgrade"}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
