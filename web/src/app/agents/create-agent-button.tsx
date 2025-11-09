import { useState } from "react";
import { useAgents, useAgentTemplates } from "@/hooks/use-agents";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { ColorInput } from "@/components/ui/color-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const createAgentSchema = z.object({
  templateId: z.string().optional(),
  name: z.string().min(1, "Name is required").max(50),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(1, "System prompt is required"),
  model: z.string().min(1, "Model is required"),
  temperature: z.string().regex(/^0(\.\d+)?$|^1(\.0+)?$|^2(\.0+)?$/, "Temperature must be between 0 and 2"),
  maxTokens: z.number().min(1).max(32000),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid color format"),
});

type CreateAgentFormData = z.infer<typeof createAgentSchema>;

interface FormFieldProps {
  field: {
    onChange: (...event: any[]) => void;
    onBlur: () => void;
    value: any;
    name: string;
    ref: React.Ref<any>;
  };
}

export function CreateAgentButton() {
  const [open, setOpen] = useState(false);
  const { createAgent } = useAgents();
  const { templates, isLoading: loadingTemplates } = useAgentTemplates();

  const form = useForm<CreateAgentFormData>({
    resolver: zodResolver(createAgentSchema),
    defaultValues: {
      templateId: undefined,
      name: "",
      description: "",
      systemPrompt: "",
      model: "gpt-4",
      temperature: "0.7",
      maxTokens: 2000,
      color: "#3B82F6",
    },
  });

  const onSubmit = async (data: CreateAgentFormData) => {
    try {
      await createAgent(data);
      setOpen(false);
      form.reset();
    } catch (error) {
      console.error("Failed to create agent:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[85vh] w-[95vw] sm:max-w-xl md:max-w-2xl lg:max-w-3xl p-0 flex-col">
        <DialogHeader className="border-b px-6 py-4 sticky top-0 bg-background z-10">
          <DialogTitle>Create New Agent</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-6">
            <FormField
              control={form.control}
              name="templateId"
              render={({ field }: FormFieldProps) => (
                <FormItem>
                  <FormLabel>Template (optional)</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value ?? ""}
                      onValueChange={(value) => {
                        if (value === "__none__") {
                          // Clear selection to show placeholder
                          field.onChange("");
                          return;
                        }
                        const selected = templates.find(t => t.id === value);
                        field.onChange(value);
                        if (selected) {
                          // Prefill form fields from template
                          form.setValue("name", selected.name || "");
                          form.setValue("description", selected.description || "");
                          form.setValue("systemPrompt", selected.systemPrompt || "");
                          form.setValue("model", selected.model || "gpt-4");
                          form.setValue("temperature", (selected.temperature as unknown as string) || "0.7");
                          form.setValue("maxTokens", selected.maxTokens ?? 2000);
                          form.setValue("color", selected.color || "#3B82F6");
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={loadingTemplates ? "Loading templates..." : "Select a template"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }: FormFieldProps) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Research Assistant" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }: FormFieldProps) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="A helpful AI assistant that helps with research tasks..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="systemPrompt"
              render={({ field }: FormFieldProps) => (
                <FormItem>
                  <FormLabel>System Prompt</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="You are a helpful research assistant..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="model"
                render={({ field }: FormFieldProps) => (
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="temperature"
                render={({ field }: FormFieldProps) => (
                  <FormItem>
                    <FormLabel>Temperature</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        {...field}
                        onChange={e => field.onChange(parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxTokens"
                render={({ field }: FormFieldProps) => (
                  <FormItem>
                    <FormLabel>Max Tokens</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="32000"
                        {...field}
                        onChange={e => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="color"
                render={({ field }: FormFieldProps) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <ColorInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            </div>
            <div className="border-t px-6 py-4">
              <Button type="submit" className="w-full sm:w-auto">
                Create Agent
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
