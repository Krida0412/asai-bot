"use client";

import { useTheme } from "next-themes";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { BACKGROUND_COLORS } from "lib/const";
import { createDebounce, cn } from "lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { AgentIcon } from "app-types/agent";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "ui/tabs";
import { Button } from "ui/button";
import { Loader2, Upload, ImageIcon } from "lucide-react";
import { useFileUpload } from "@/hooks/use-presigned-upload";
import { useRef } from "react";

const colorUpdateDebounce = createDebounce();

interface AgentIconPickerProps {
  icon?: AgentIcon;
  disabled?: boolean;
  onChange: (icon: AgentIcon) => void;
}

export function AgentIconPicker({
  icon,
  disabled = false,
  onChange,
}: AgentIconPickerProps) {
  const { theme } = useTheme();

  const handleColorChange = (color: string) => {
    onChange({
      ...icon!,
      style: { backgroundColor: color },
    });
  };

  const handleEmojiSelect = (emoji: any) => {
    onChange({
      ...icon!,
      value: emoji.imageUrl,
      type: "emoji",
    });
  };

  const { upload, isUploading } = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await upload(file);
    if (result?.url) {
      onChange({
        ...icon!,
        value: result.url,
        type: "image",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <div
          style={{
            backgroundColor: icon?.style?.backgroundColor,
          }}
          className={cn(
            "transition-colors group items-center justify-center flex w-16 h-16 rounded-lg ring ring-background",
            !disabled && "hover:bg-secondary! cursor-pointer hover:ring-ring",
          )}
        >
          <Avatar className="size-10">
            {icon?.type === "image" ? (
               <AvatarImage
                 src={icon.value}
                 className="group-hover:scale-110 object-cover transition-transform"
               />
            ) : (
               <AvatarImage
                 src={icon?.value}
                 className="group-hover:scale-110 transition-transform"
               />
            )}
            <AvatarFallback></AvatarFallback>
          </Avatar>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="p-0 bg-secondary flex flex-col border-none overflow-hidden rounded-xl shadow-lg w-[350px]">
        <Tabs defaultValue="emoji" className="w-full">
           <TabsList className="w-full grid grid-cols-2 rounded-none border-b bg-transparent h-12">
              <TabsTrigger value="emoji" className="data-[state=active]:bg-background/50 rounded-none h-full">Emoji</TabsTrigger>
              <TabsTrigger value="image" className="data-[state=active]:bg-background/50 rounded-none h-full">Image</TabsTrigger>
           </TabsList>
           
           <TabsContent value="emoji" className="mt-0 border-none outline-none p-0 flex flex-col">
              <div className="flex gap-2 border-b p-3 bg-secondary">
                {BACKGROUND_COLORS.map((color, index) => (
                  <div
                    key={index}
                    className="w-6 h-6 rounded cursor-pointer"
                    onClick={() => handleColorChange(color)}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <div className="relative">
                  <input
                    type="color"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => {
                      colorUpdateDebounce(() => {
                        handleColorChange(e.target.value);
                      }, 100);
                    }}
                  />
                  <div className="w-6 h-6 rounded cursor-pointer border-muted-foreground/50 flex items-center justify-center hover:border-muted-foreground transition-colors">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: icon?.style?.backgroundColor,
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="bg-background">
                <EmojiPicker
                  lazyLoadEmojis
                  open
                  width="100%"
                  className="fade-300 border-none rounded-none!"
                  theme={theme === "dark" ? Theme.DARK : Theme.LIGHT}
                  onEmojiClick={handleEmojiSelect}
                />
              </div>
           </TabsContent>

           <TabsContent value="image" className="mt-0 p-6 flex flex-col items-center justify-center gap-4 bg-background min-h-[300px]">
              <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center mb-2 overflow-hidden border-4 border-muted">
                 {icon?.type === "image" && icon.value ? (
                    <img src={icon.value} alt="Agent Profile" className="w-full h-full object-cover" />
                 ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground opacity-50" />
                 )}
              </div>
              
              <input 
                 type="file" 
                 ref={fileInputRef} 
                 className="hidden" 
                 accept="image/*" 
                 onChange={handleFileUpload} 
              />
              
              <Button 
                 variant="secondary" 
                 disabled={isUploading}
                 onClick={() => fileInputRef.current?.click()}
                 className="w-full"
              >
                 {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                 {isUploading ? "Uploading..." : "Click to upload photo"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                 Supported formats: JPG, PNG, GIF
              </p>
           </TabsContent>
        </Tabs>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
