"use client";

import { useState } from "react";
import {
  HelpCircle,
  Book,
  MessageCircle,
  Mail,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ_ITEMS = [
  {
    question: "How do I upload a track?",
    answer:
      "Navigate to your project page and drag and drop audio files into the upload area. You can also click to browse and select files from your computer. We support WAV, MP3, FLAC, AAC, OGG, and M4A formats.",
  },
  {
    question: "What audio formats are supported?",
    answer:
      "Budi supports all major audio formats including WAV, MP3, FLAC, AAC, OGG, and M4A. For best results, we recommend uploading high-quality WAV or FLAC files.",
  },
  {
    question: "How does AI mastering work?",
    answer:
      "Our AI analyzes your track's spectral balance, dynamics, and loudness to apply professional mastering processing. The AI adapts to your selected genre profile and target loudness to achieve optimal results.",
  },
  {
    question: "What's the difference between 'Fix' and 'Master'?",
    answer:
      "'Fix' addresses specific audio issues like clipping, noise, and phase problems. 'Master' applies full professional mastering including EQ, compression, and limiting to achieve commercial-ready sound.",
  },
  {
    question: "How many tracks can I process per month?",
    answer:
      "Track limits depend on your subscription plan. Free users can process 5 tracks per month, Pro users get 100 tracks, and Enterprise users have unlimited processing.",
  },
  {
    question: "Can I export in different formats?",
    answer:
      "Yes! You can export your processed tracks in WAV, MP3, FLAC, or AAC formats with customizable quality settings including sample rate, bit depth, and bitrate.",
  },
  {
    question: "How do I cancel my subscription?",
    answer:
      "Go to the Billing page and click 'Manage Subscription' to access the customer portal where you can cancel, upgrade, or modify your subscription.",
  },
  {
    question: "Is my audio data secure?",
    answer:
      "Yes, all audio files are encrypted in transit and at rest. We never share your audio with third parties and you retain full ownership of your content.",
  },
];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredFAQ = FAQ_ITEMS.filter(
    (item) =>
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Help & Support</h2>
        <p className="text-muted-foreground">
          Find answers and get help with Budi
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <HelpCircle className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search for help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 text-lg"
            />
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer transition-shadow hover:shadow-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <Book className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Documentation</CardTitle>
                <CardDescription>Read the full guide</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
        <Card className="cursor-pointer transition-shadow hover:shadow-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <MessageCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Community</CardTitle>
                <CardDescription>Join the discussion</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
        <Card className="cursor-pointer transition-shadow hover:shadow-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                <Mail className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Contact Support</CardTitle>
                <CardDescription>Get personalized help</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
          <CardDescription>
            Common questions and answers about using Budi
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredFAQ.length > 0 ? (
            <Accordion type="single" collapsible className="w-full">
              {filteredFAQ.map((item, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger>{item.question}</AccordionTrigger>
                  <AccordionContent>{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="py-8 text-center">
              <HelpCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                No results found. Try a different search term.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader>
          <CardTitle>Still need help?</CardTitle>
          <CardDescription>
            Our support team is here to assist you
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            If you couldn't find what you're looking for, feel free to reach out
            to our support team. We typically respond within 24 hours.
          </p>
          <div className="flex gap-4">
            <Button>
              <Mail className="mr-2 h-4 w-4" />
              Contact Support
            </Button>
            <Button variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              View Status Page
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
