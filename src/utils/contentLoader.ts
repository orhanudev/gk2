import { Group, Subgroup } from "../types";

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

async function loadManifest(): Promise<string[]> {
  try {
    console.log("📋 Loading content manifest...");
    const response = await fetch("/contents/manifest.json");

    if (!response.ok) {
      console.log("❌ No manifest.json found");
      return [];
    }

    const manifest = await response.json();

    if (!Array.isArray(manifest)) {
      console.error("❌ Invalid manifest format - should be array");
      return [];
    }

    // Convert to full paths
    const filePaths = manifest.map(path => 
      path.startsWith("/") ? path : `/contents/${path}`
    );

    console.log(`✅ Loaded manifest with ${filePaths.length} files`);
    return filePaths;
  } catch (error) {
    console.error("❌ Error loading manifest:", error);
    return [];
  }
}

function mergeSubgroups(subgroups: Subgroup[]): Subgroup[] {
  const subgroupMap = new Map<string, Subgroup>();

  subgroups.forEach(subgroup => {
    const existing = subgroupMap.get(subgroup.name);
    if (existing) {
      // Merge videos (avoid duplicates by videoId)
      const existingVideoIds = new Set(existing.videos?.map(v => v.id.videoId) || []);
      const newVideos = subgroup.videos?.filter(v => !existingVideoIds.has(v.id.videoId)) || [];
      existing.videos = [...(existing.videos || []), ...newVideos];
      
      // Merge nested subgroups recursively
      if (subgroup.subgroups && subgroup.subgroups.length > 0) {
        existing.subgroups = mergeSubgroups([...(existing.subgroups || []), ...subgroup.subgroups]);
      }
      
      // Update metadata if not set
      if (!existing.viewName && subgroup.viewName) {
        existing.viewName = subgroup.viewName;
      }
      if (!existing.channelId && subgroup.channelId) {
        existing.channelId = subgroup.channelId;
      }
    } else {
      subgroupMap.set(subgroup.name, {
        name: subgroup.name,
        viewName: subgroup.viewName || subgroup.name,
        channelId: subgroup.channelId || "",
        videos: [...(subgroup.videos || [])],
        subgroups: subgroup.subgroups ? mergeSubgroups([...subgroup.subgroups]) : []
      });
    }
  });

  return Array.from(subgroupMap.values());
}

function mergeGroups(groups: Group[]): Group[] {
  const groupMap = new Map<string, Group>();

  groups.forEach(group => {
    const existing = groupMap.get(group.name);
    if (existing) {
      // Merge subgroups
      existing.subgroups = mergeSubgroups([...existing.subgroups, ...group.subgroups]);
    } else {
      groupMap.set(group.name, {
        name: group.name,
        subgroups: [...group.subgroups]
      });
    }
  });

  return Array.from(groupMap.values());
}

export async function loadAllContent(): Promise<Group[]> {
  try {
    console.log("🚀 Starting content loading...");

    // Load the manifest file
    const filePaths = await loadManifest();

    if (filePaths.length === 0) {
      console.log("❌ No files found in manifest");
      return [];
    }

    console.log("📋 Files to load:", filePaths);

    // Group files by their folder path (excluding filename)
    const folderGroups = new Map<string, string[]>();
    
    filePaths.forEach(filePath => {
      // Extract folder path (everything except the filename)
      const pathParts = filePath.split('/');
      const filename = pathParts.pop(); // Remove filename
      const folderPath = pathParts.join('/');
      
      if (!folderGroups.has(folderPath)) {
        folderGroups.set(folderPath, []);
      }
      folderGroups.get(folderPath)!.push(filePath);
    });

    console.log("📁 Folder groups:", Array.from(folderGroups.entries()));

    // Group files by their folder path
    const folderGroups = new Map<string, string[]>();
    
    filePaths.forEach(filePath => {
      // Extract folder path (everything except the filename)
      const pathParts = filePath.replace(/^\/contents\//, '').split('/');
      pathParts.pop(); // Remove filename
      const folderPath = pathParts.join('/');
      
      if (!folderGroups.has(folderPath)) {
        folderGroups.set(folderPath, []);
      }
      for (const filePath of files) {
        const content = await loadJsonFile(filePath);
        if (content.length > 0) {
          console.log(`📥 Loaded ${content.length} groups from ${filePath}`);
          folderContent.push(...content);
        }
      }
      
      // Merge content from all files in this folder
      if (folderContent.length > 0) {
        const mergedFolderGroups = mergeGroups(folderContent);
        allGroups.push(...mergedFolderGroups);
      }
      folderGroups.get(folderPath)!.push(filePath);
    });

    console.log("📁 Folder groups:", Array.from(folderGroups.entries()));

    // Load and merge content from all files, using folder names in navigation
    const allGroups: Group[] = [];
    
    for (const [folderPath, files] of folderGroups.entries()) {
      console.log(`📂 Processing folder: ${folderPath} with ${files.length} files`);
      
      // Load all files in this folder
      const folderContent: Group[] = [];
      for (const filePath of files) {
        const content = await loadJsonFile(filePath);
        if (content.length > 0) {
          console.log(`📥 Loaded ${content.length} groups from ${filePath}`);
          folderContent.push(...content);
        }
      }
      
      // If we have content and a folder path, use folder name as group name
      if (folderContent.length > 0 && folderPath) {
        const folderName = folderPath.split('/').pop() || folderPath;
        
        // Merge all content from this folder under the folder name
        const mergedFolderGroups = mergeGroups(folderContent);
        
        // Create a new group with the folder name
        const folderGroup: Group = {
          name: folderName,
          subgroups: []
        };
        
        // Merge all subgroups from the folder content
        mergedFolderGroups.forEach(group => {
          folderGroup.subgroups.push(...group.subgroups);
        });
        
        allGroups.push(folderGroup);
      } else {
        // No folder path, use original group names
        const mergedFolderGroups = mergeGroups(folderContent);
        allGroups.push(...mergedFolderGroups);
      }
    }

    if (allGroups.length === 0) {
      console.log("❌ No valid content loaded from any files");
      return [];
    }

    // Final merge of all groups (in case same group names exist across different folders)
    const finalGroups = mergeGroups(allGroups);

    console.log("✅ Content loading complete. Final structure:");
    finalGroups.forEach((group) => {
      console.log(`Group: ${group.name}`);
      const logSubgroup = (sg: Subgroup, indent = "  ") => {
        const videosCount = sg.videos?.length || 0;
        const subgroupsCount = sg.subgroups?.length || 0;
        console.log(
          `${indent}${sg.viewName || sg.name} (${videosCount} videos, ${subgroupsCount} subgroups)`
        );
        sg.subgroups?.forEach((sub) => logSubgroup(sub, indent + "  "));
      };
      group.subgroups.forEach((sg) => logSubgroup(sg));
    });

    return finalGroups;
  } catch (error) {
    console.error("❌ Error in content loading:", error);
    return [];
  }
}