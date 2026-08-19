"use client";

import { navItems } from "@/consts/nav";
import { Menu } from "lucide-react";
import { EnhancedLink } from "./enhanced-link";
import { Button } from "./ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./ui/drawer";

export function NavDrawer() {
  return (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <Button
          variant="primary"
          size="icon-lg"
          rounded="full"
          className="md:hidden"
        >
          <Menu />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="md:hidden">
        <DrawerHeader>
          <DrawerTitle className="text-center text-2xl">Menu</DrawerTitle>
        </DrawerHeader>
        <ul className="no-scrollbar flex grow flex-col overflow-y-auto px-4 pb-4">
          {navItems.map((navItem) => (
            <li
              key={navItem.label}
              className="flex grow items-center justify-center text-center"
            >
              <DrawerClose asChild>
                <EnhancedLink
                  href={navItem.href}
                  buttonProps={{ variant: "reversedText", size: "text" }}
                  className="text-xl"
                >
                  {navItem.label}
                </EnhancedLink>
              </DrawerClose>
            </li>
          ))}
        </ul>
      </DrawerContent>
    </Drawer>
  );
}
