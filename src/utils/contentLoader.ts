import { Group, Subgroup } from "../types";

interface ManifestEntry {
  path: string;
  type: "file" | "folder";
  name?: string;
}

async function loadJsonFile(path: string): Promise<any[]> {
  try {
    console.log(`Loading: ${path}`);
    const response = await fetch(path);

    if (!response.ok) {
      console.log(`File not found: ${path} (status: ${response.status})`);
      return [];
    }

    const text = await response.text();

    // Check if it's HTML (directory listing) instead of JSON
    if (
      text.trim().startsWith("<!DOCTYPE") ||
      text.trim().startsWith("<html")
    ) {
      console.log(`Got HTML instead of JSON for: ${path}`);
      return [];
    }

    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        console.warn(`Invalid data format in ${path} - not an array`);
        return [];
      }

      console.log(`✅ Successfully loaded ${path} with ${data.length} items`);
      return data;
    } catch (parseError) {
      console.error(`❌ JSON parse error for ${path}:`, parseError);
      return [];
    }
  } catch (error) {
    console.error(`❌ Error loading ${path}:`, error);
    return [];
  }
}

async function testFileExists(path: string): Promise<boolean> {
  try {
    const response = await fetch(path);
    if (!response.ok) return false;

    const text = await response.text();
    // Make sure it's not HTML
    if (
      text.trim().startsWith("<!DOCTYPE") ||
      text.trim().startsWith("<html")
    ) {
      return false;
    }

    // Try to parse as JSON to verify it's valid
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

async function loadManifest(): Promise<ManifestEntry[]> {
  try {
    console.log("📋 Loading content manifest...");
    const response = await fetch("/contents/manifest.json");

    if (!response.ok) {
      console.log("❌ No manifest.json found");
      return [];
    }

    const manifest = await response.json();

    // Handle both simple array format and detailed object format
    const entries: ManifestEntry[] = [];

    if (Array.isArray(manifest)) {
      // Simple format: ["path1", "path2", ...]
      manifest.forEach((item) => {
        if (typeof item === "string") {
          entries.push({
            path: item,
            type: item.endsWith(".json") ? "file" : "folder",
          });
        } else if (item && typeof item === "object") {
          // Object format: {path: "...", type: "...", name: "..."}
          entries.push({
            path: item.path,
            type:
              item.type || (item.path.endsWith(".json") ? "file" : "folder"),
            name: item.name,
          });
        }
      });
    } else {
      console.error("❌ Invalid manifest format - should be array");
      return [];
    }

    console.log(`✅ Loaded manifest with ${entries.length} entries`);
    return entries;
  } catch (error) {
    console.error("❌ Error loading manifest:", error);
    return [];
  }
}

function normalizeManifestEntries(entries: ManifestEntry[]): ManifestEntry[] {
  return entries.map((entry) => ({
    ...entry,
    path: entry.path.startsWith("/") ? entry.path : `/contents/${entry.path}`,
  }));
}

function buildGroupStructureFromManifest(entries: ManifestEntry[]): { groups: Group[], fileMap: Map<string, string[]> } {
  console.log("🏗️ Building group structure from manifest entries:", entries);

  const groups: Group[] = [];
  const groupMap = new Map<string, Group>();
  const fileMap = new Map<string, string[]>(); // Maps navigation path to file paths

  // Process each manifest entry
  entries.forEach((entry) => {
    // Remove /content/ prefix if present for processing
    const cleanPath = entry.path.replace(/^\/contents\//, "");
    const pathParts = cleanPath.split("/").filter((part) => part.length > 0);

    if (pathParts.length === 0) {
      console.warn(`Invalid entry path: ${entry.path}`);
      return;
    }

    // For JSON files, we need to determine the actual navigation structure
    // The file path structure should map to navigation, not include the filename
    let navigationParts: string[];
    
    if (entry.type === "file" && entry.path.endsWith('.json')) {
      // For JSON files, exclude the filename from navigation structure
      navigationParts = pathParts.slice(0, -1); // Remove filename
      
      // The navigation path is everything except the filename
      const navigationPath = navigationParts.join('/');
      
      // Map this file to its navigation path
      if (!fileMap.has(navigationPath)) {
        fileMap.set(navigationPath, []);
      }
      fileMap.get(navigationPath)!.push(entry.path);
      
      console.log(`Mapped file ${entry.path} to navigation path: ${navigationPath}`);
    } else {
      // For folders, use the full path
      navigationParts = pathParts;
    }
    
    if (navigationParts.length === 0) {
      console.warn(`No navigation structure for entry: ${entry.path}`);
      return;
    }
    
    const groupName = navigationParts[0];

    console.log(
      `Processing: type="${entry.type}", path="${entry.path}", group="${groupName}", navigationParts="${navigationParts.join('/')}"`
    );

    // Get or create group
    let group = groupMap.get(groupName);
    if (!group) {
      group = {
        name: groupName,
        subgroups: [],
      };
      groupMap.set(groupName, group);
      groups.push(group);
      console.log(`Created group: ${groupName}`);
    }

    // Navigate/create the path hierarchy for navigation structure only
    let currentSubgroups = group.subgroups;
    let currentNavPath = groupName;

    // Process navigation parts (excluding filename for JSON files)
    for (let i = 1; i < navigationParts.length; i++) {
      const folderName = navigationParts[i];
      currentNavPath += `/${folderName}`;

      // Use navigation path as unique identifier
      let existingSubgroup = currentSubgroups.find(
        (sg) => sg._navPath === currentNavPath
      );
      
      if (!existingSubgroup) {
        existingSubgroup = {
          name: folderName,
          viewName: entry.name || folderName,
          channelId: "",
          videos: [],
          subgroups: [],
          _navPath: currentNavPath, // Track navigation path for uniqueness
        };

        currentSubgroups.push(existingSubgroup);
        console.log(`Created navigation level: ${currentNavPath}`);
      } else {
        // Update viewName if provided in manifest
        if (entry.name) {
          existingSubgroup.viewName = entry.name;
        }
      }

      currentSubgroups = existingSubgroup.subgroups || [];
    }
  });

  // Clean up the temporary _navPath properties
  const cleanupTempProperties = (subgroups: Subgroup[]) => {
    subgroups.forEach((sg) => {
      delete (sg as any)._navPath;
      if (sg.subgroups) {
        cleanupTempProperties(sg.subgroups);
      }
    });
  };

  groups.forEach((group) => cleanupTempProperties(group.subgroups));

  console.log(`✅ Built ${groups.length} groups with hierarchy`);
  console.log('📁 File mapping:', Array.from(fileMap.entries()));
  return { groups, fileMap };
}

async function loadContentForSubgroup(subgroup: Subgroup, fileMap: Map<string, string[]>, currentPath: string): Promise<void> {
  const filePaths = fileMap.get(currentPath);
  if (!filePaths || filePaths.length === 0) {
    console.log(
      `📂 Subgroup "${subgroup.name}" at path "${currentPath}" has no associated files`
    );
    return;
  }

  console.log(
    `📥 Loading and merging content for subgroup "${subgroup.name}" from ${filePaths.length} file(s): ${filePaths.join(', ')}`
  );

  // Load content from all files and merge
  let allContent: any[] = [];
  for (const filePath of filePaths) {
    const content = await loadJsonFile(filePath);
    allContent = allContent.concat(content);
  }

  if (allContent.length === 0) {
    console.log(`📭 No content loaded from files for path: ${currentPath}`);
    return;
  }

  // Initialize arrays if they don't exist
  if (!subgroup.subgroups) subgroup.subgroups = [];
  if (!subgroup.videos) subgroup.videos = [];

  // Process all loaded content items and merge them
  allContent.forEach((item) => {
    // Process each top-level item from the JSON files
    if (Array.isArray(item)) {
      // If the item is an array, process each element
      item.forEach(subItem => processContentItem(subItem, subgroup));
    } else {
      // Process single item
      processContentItem(item, subgroup);
    }



  console.log(
    `✅ Loaded content for "${subgroup.viewName || subgroup.name}": ${
      subgroup.videos?.length || 0
    } videos, ${subgroup.subgroups?.length || 0} subgroups`
  );
}

function processContentItem(item: any, targetSubgroup: Subgroup): void {
  if (item.name && item.subgroups && Array.isArray(item.subgroups)) {
    // This is a group structure - merge its subgroups
    item.subgroups.forEach((sub: any) => {
      mergeSubgroupContent(sub, targetSubgroup);
    });
    
    // Update metadata if present
    if (item.channelId) targetSubgroup.channelId = item.channelId;
  } else if (item.videos && Array.isArray(item.videos)) {
    // Direct videos array
    targetSubgroup.videos = [...(targetSubgroup.videos || []), ...item.videos];
  } else if (item.subgroups && Array.isArray(item.subgroups)) {
    // Direct subgroups array
    item.subgroups.forEach((sub: any) => {
      mergeSubgroupContent(sub, targetSubgroup);
    });
  } else if (Array.isArray(item)) {
    // Item itself is an array of videos
    targetSubgroup.videos = [...(targetSubgroup.videos || []), ...item];
  } else if (item.id || item.title || item.url) {
    // Single video object
    targetSubgroup.videos = [...(targetSubgroup.videos || []), item];
  }
  
  // Update metadata if present at root level
  if (item.viewName && !item.subgroups) targetSubgroup.viewName = item.viewName;
  if (item.channelId && !item.subgroups) targetSubgroup.channelId = item.channelId;
}

function mergeSubgroupContent(sourceSubgroup: any, targetParent: Subgroup): void {
  // Check if a subgroup with this name already exists in target
  let existingSubgroup = targetParent.subgroups!.find(sg => sg.name === sourceSubgroup.name);
  
  if (existingSubgroup) {
    // Merge videos into existing subgroup
    if (sourceSubgroup.videos && Array.isArray(sourceSubgroup.videos)) {
      existingSubgroup.videos = [...(existingSubgroup.videos || []), ...sourceSubgroup.videos];
    }
    
    // Merge nested subgroups recursively
    if (sourceSubgroup.subgroups && Array.isArray(sourceSubgroup.subgroups)) {
      sourceSubgroup.subgroups.forEach((nestedSub: any) => {
        mergeSubgroupContent(nestedSub, existingSubgroup!);
      });
    }
    
    // Update metadata
    if (sourceSubgroup.viewName) existingSubgroup.viewName = sourceSubgroup.viewName;
    if (sourceSubgroup.channelId) existingSubgroup.channelId = sourceSubgroup.channelId;
  } else {
    // Create new subgroup
    const newSubgroup: Subgroup = {
      name: sourceSubgroup.name,
      viewName: sourceSubgroup.viewName || sourceSubgroup.name,
      channelId: sourceSubgroup.channelId || "",
      videos: sourceSubgroup.videos || [],
      subgroups: sourceSubgroup.subgroups || [],
    };

    // Recursively process nested subgroups
    if (sourceSubgroup.subgroups && Array.isArray(sourceSubgroup.subgroups)) {
      processNestedSubgroups(newSubgroup, sourceSubgroup.subgroups);
    }

    targetParent.subgroups!.push(newSubgroup);
  }
}

function processNestedSubgroups(
  parentSubgroup: Subgroup,
  nestedSubgroups: any[]
): void {
  nestedSubgroups.forEach((nested) => {
    const nestedSubgroup: Subgroup = {
      name: nested.name,
      viewName: nested.viewName || nested.name,
      channelId: nested.channelId || "",
      videos: nested.videos || [],
      subgroups: nested.subgroups || [],
    };

    // Recursively process deeper nesting
    if (nested.subgroups && Array.isArray(nested.subgroups)) {
      processNestedSubgroups(nestedSubgroup, nested.subgroups);
    }

    parentSubgroup.subgroups!.push(nestedSubgroup);
  });
}

async function loadContentRecursively(subgroups: Subgroup[], fileMap: Map<string, string[]>, basePath: string = ""): Promise<void> {
  for (const subgroup of subgroups) {
    const currentPath = basePath ? `${basePath}/${subgroup.name}` : subgroup.name;
    await loadContentForSubgroup(subgroup, fileMap, currentPath);

    // Recursively load content for nested subgroups
    if (subgroup.subgroups && subgroup.subgroups.length > 0) {
      await loadContentRecursively(subgroup.subgroups, fileMap, currentPath);
    }
  }
}

export async function loadAllContent(): Promise<Group[]> {
  try {
    console.log("🚀 Starting manifest-based content loading...");

    // Load the manifest file
    const manifestEntries = await loadManifest();

    if (manifestEntries.length === 0) {
      console.log("❌ No entries found in manifest");
      return [];
    }

    console.log("📋 Raw manifest entries:", manifestEntries);

    // Normalize paths in manifest entries
    const normalizedEntries = normalizeManifestEntries(manifestEntries);
    console.log("📋 Normalized manifest entries:", normalizedEntries);

    // Build group structure from manifest entries
    const { groups, fileMap } = buildGroupStructureFromManifest(normalizedEntries);

    if (groups.length === 0) {
      console.log("❌ No groups could be built from manifest entries");
      return [];
    }

    console.log(
      "🏗️ Built initial group structure:",
      groups.map((g) => ({
        name: g.name,
        subgroups: g.subgroups.length,
      }))
    );

    // Load actual content from the files
    for (const group of groups) {
      console.log(`📥 Loading content for group: ${group.name}`);
      await loadContentRecursively(group.subgroups, fileMap, group.name);
    }

    console.log("✅ Content loading complete. Final structure:");
    groups.forEach((group) => {
      console.log(`Group: ${group.name}`);
      const logSubgroup = (sg: Subgroup, indent = "  ") => {
        const videosCount = sg.videos?.length || 0;
        const subgroupsCount = sg.subgroups?.length || 0;
        const isEmpty = videosCount === 0 && subgroupsCount === 0;
        console.log(
          `${indent}${
            sg.viewName || sg.name
          } (${videosCount} videos, ${subgroupsCount} subgroups)${
            isEmpty ? " [EMPTY]" : ""
          }`
        );
        sg.subgroups?.forEach((sub) => logSubgroup(sub, indent + "  "));
      };
      group.subgroups.forEach((sg) => logSubgroup(sg));
    });

    return groups;
  } catch (error) {
    console.error("❌ Error in content loading:", error);
    return [];
  }
}
