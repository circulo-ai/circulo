import { Agent } from "@/db/schema";
import { useAgentMutations } from "@/hooks/use-agent-mutations";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ColorInput } from "@/components/ui/color-input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { z } from "zod";

const editAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(1, "System prompt is required"),
  model: z.string().min(1, "Model is required"),
  temperature: z.string().regex(/^0(\.\d+)?$|^1(\.0+)?$|^2(\.0+)?$/, "Temperature must be between 0 and 2"),
  maxTokens: z.number().min(1).max(32000),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid color format"),
});

type EditAgentFormData = z.infer<typeof editAgentSchema>;

interface FormFieldProps {
  field: {
    onChange: (...event: any[]) => void;
    onBlur: () => void;
    value: any;
    name: string;
    ref: React.Ref<any>;
  };
}

interface EditAgentFormProps {
  agent: Agent;
}

export function EditAgentForm({ agent }: EditAgentFormProps) {
  const router = useRouter();
  const { updateAgent } = useAgentMutations();

  const form = useForm<EditAgentFormData>({
    resolver: zodResolver(editAgentSchema),
    defaultValues: {
      name: agent.name,
      description: agent.description || "",
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      temperature: agent.temperature.toString(),
      maxTokens: agent.maxTokens || 2000,
      color: agent.color || "#3B82F6",
    },
  });

  const onSubmit = async (data: EditAgentFormData) => {
    try {
      await updateAgent(agent.id, data);
      router.push("/agents");
    } catch (error) {
      console.error("Failed to update agent:", error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
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

        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit">
            Save Changes
          </Button>
        </div>
      </form>
    </Form>
  );
}
