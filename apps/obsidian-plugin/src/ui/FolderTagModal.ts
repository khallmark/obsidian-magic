import { Modal, Notice, Setting, TFolder } from 'obsidian';

import type MagusMarkPlugin from '../main';

export interface FolderTagModalType {
  folderItems: HTMLElement[];
  searchInput: HTMLInputElement;
  selectedFolderPath: string;
  includeSubfoldersCheckbox: HTMLInputElement;
  handleFolderClick(evt: { currentTarget: HTMLElement }): void;
  handleFolderSearch(evt: { target: HTMLInputElement }): void;
  handleTagButtonClick(): void;
}

export class FolderTagModal extends Modal implements FolderTagModalType {
  private selectedFolder: TFolder | null = null;
  private includeSubfolders = true;
  private onSubmit: (folder: TFolder, includeSubfolders: boolean) => void;

  constructor(plugin: MagusMarkPlugin, onSubmit: (folder: TFolder, includeSubfolders: boolean) => void) {
    super(plugin.app);
    this.onSubmit = onSubmit;
  }
  folderItems: HTMLElement[] = [];
  searchInput: HTMLInputElement = document.createElement('input');
  selectedFolderPath = '';
  includeSubfoldersCheckbox: HTMLInputElement = document.createElement('input');
  handleFolderClick(evt: { currentTarget: HTMLElement }): void {
    console.log('handleFolderClick', evt);
  }
  handleFolderSearch(evt: { target: HTMLInputElement }): void {
    console.log('handleFolderSearch', evt);
  }
  handleTagButtonClick(): void {
    console.log('handleTagButtonClick');
  }

  override onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: 'Tag Folder' });

    // Folder selection
    new Setting(contentEl)
      .setName('Select folder')
      .setDesc('Choose a folder to tag all Markdown files within it')
      .addDropdown((dropdown) => {
        // Get all folders in the vault
        const folders = this.getAllFolders();

        // Add root folder option
        dropdown.addOption('/', 'Root');

        // Add all other folders
        folders.forEach((folder) => {
          dropdown.addOption(folder.path, folder.path);
        });

        dropdown.onChange((value) => {
          if (value === '/') {
            // Root folder
            this.selectedFolder = this.app.vault.getRoot();
          } else {
            // Find the selected folder
            this.selectedFolder = this.getFolderByPath(value);
          }
        });
      });

    // Include subfolders toggle
    new Setting(contentEl)
      .setName('Include subfolders')
      .setDesc('Tag files in subfolders as well')
      .addToggle((toggle) => {
        toggle.setValue(this.includeSubfolders);
        toggle.onChange((value) => {
          this.includeSubfolders = value;
        });
      });

    // Submit button
    new Setting(contentEl).addButton((button) => {
      button
        .setButtonText('Start Tagging')
        .setCta()
        .onClick(() => {
          if (!this.selectedFolder) {
            new Notice('Please select a folder first');
            return;
          }

          this.onSubmit(this.selectedFolder, this.includeSubfolders);
          this.close();
        });
    });

    // Cancel button
    new Setting(contentEl).addButton((button) => {
      button.setButtonText('Cancel').onClick(() => {
        this.close();
      });
    });
  }

  override onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  private getAllFolders(): TFolder[] {
    const folders: TFolder[] = [];
    this.app.vault.getRoot().children.forEach((child) => {
      if (child instanceof TFolder) {
        folders.push(child);
        this.getSubfolders(child, folders);
      }
    });
    return folders;
  }

  private getSubfolders(folder: TFolder, folders: TFolder[]): void {
    folder.children.forEach((child) => {
      if (child instanceof TFolder) {
        folders.push(child);
        this.getSubfolders(child, folders);
      }
    });
  }

  private getFolderByPath(path: string): TFolder | null {
    const folder = this.app.vault.getAbstractFileByPath(path);
    return folder instanceof TFolder ? folder : null;
  }
}
