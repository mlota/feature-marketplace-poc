"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const archiver_1 = __importDefault(require("archiver"));
const fs = __importStar(require("fs"));
const fs_1 = require("fs");
const path = __importStar(require("path"));
const xml2js_1 = require("xml2js");
const marketplace_models_1 = require("./models/marketplace.models");
// Constants
const GITHUB_TRIGGERING_ACTOR = process.env.GITHUB_TRIGGERING_ACTOR;
const GITHUB_ACTOR = process.env.GITHUB_ACTOR;
const GITHUB_WORKSPACE = process.env.GITHUB_WORKSPACE;
const INDEX_FILE = path.join(GITHUB_WORKSPACE, 'index.json');
const CONTENT_DIR = path.join(GITHUB_WORKSPACE, 'content');
const IGNORED_DIRECTORY_CONTENT = [
    'dist',
    '.DS_Store',
    'package.xml',
    'info.json',
];
const errors = [];
/**
 * Read all files from the given folders and their subfolders using fs.readdir's
 * recursive option.
 *
 * @param folderPaths Array of folder paths to read
 * @returns A promise that resolves to an array of file paths
 */
const getFolderStructure = (folderPaths) => __awaiter(void 0, void 0, void 0, function* () {
    let allFilePaths = [];
    for (const folder of folderPaths) {
        try {
            // Read all files and folders recursively in the folder
            const files = yield fs_1.promises.readdir(folder, {
                withFileTypes: false,
                recursive: true,
            });
            // Convert relative paths to absolute paths
            const filePaths = files.map(file => path.resolve(folder, file));
            allFilePaths = allFilePaths.concat(filePaths);
        }
        catch (ex) {
            captureError(ex, `Error reading folder ${folder}`);
        }
    }
    return allFilePaths;
});
/**
 * Create a zip file of the contents of a specified folder
 * excluding the 'dist' folder.
 *
 * @param sourceDir The path to the folder to zip
 * @param outPath The path to the output zip file
 */
const zipFolder = (sourceDir, outPath) => __awaiter(void 0, void 0, void 0, function* () {
    const output = fs.createWriteStream(outPath);
    const archive = (0, archiver_1.default)('zip', {
        zlib: { level: 9 }, // Sets the compression level
    });
    return new Promise((resolve, reject) => {
        output.on('close', () => {
            console.log(`Archive created successfully, total bytes: ${archive.pointer()}`);
            resolve();
        });
        archive.on('error', err => {
            reject(err);
        });
        archive.pipe(output);
        // Append files from the source directory, excluding the 'dist' folder
        archive.glob('**/*', {
            cwd: sourceDir,
            ignore: ['dist/**', 'info.json'],
        });
        archive.finalize();
    });
});
const getSubdirectories = (directory) => __awaiter(void 0, void 0, void 0, function* () {
    const entries = yield fs_1.promises.readdir(directory, { withFileTypes: true });
    return entries
        .filter(entry => entry.isDirectory() && !IGNORED_DIRECTORY_CONTENT.includes(entry.name))
        .map(entry => path.join(directory, entry.name));
});
const parseFilePaths = (filesPaths) => {
    const filteredPaths = filesPaths.filter(filePath => {
        const fileName = path.basename(filePath);
        return (/\.[^\/]+$/.test(fileName) &&
            !IGNORED_DIRECTORY_CONTENT.some(ignored => filePath.includes(ignored)));
    });
    return filteredPaths;
};
const createPackageXmlContent = (types, version) => {
    let xml = '';
    try {
        const builder = new xml2js_1.Builder();
        const mappedTypes = [];
        const packObj = {
            Package: {
                types: mappedTypes,
                version,
            },
        };
        // Append new nodes to the Package object
        Object.entries(types).forEach(([name, members]) => {
            mappedTypes.push({
                members,
                name,
            });
        });
        xml = builder
            .buildObject(packObj)
            .replace('<Package>', '<Package xmlns="http://soap.sforce.com/2006/04/metadata">')
            .replace(' standalone="yes"', '');
    }
    catch (ex) {
        captureError(ex, 'Error creating package.xml');
    }
    return xml;
};
const createPackageXml = (featurePath) => __awaiter(void 0, void 0, void 0, function* () {
    const folders = yield getSubdirectories(featurePath);
    const types = {};
    for (const folder of folders) {
        const baseName = path.basename(folder);
        if (marketplace_models_1.metadataTypeFolderMappings[baseName]) {
            // Read files and folders (hence using 'entries' convention)
            const entries = yield fs_1.promises.readdir(folder, { withFileTypes: true });
            types[marketplace_models_1.metadataTypeFolderMappings[baseName]] = entries.map(entry => path.parse(entry.name).name);
        }
    }
    return Promise.resolve(createPackageXmlContent(types, '62.0'));
});
const commit = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Configure git
        yield exec.exec('git', [
            'config',
            '--global',
            'user.name',
            'github-actions[bot]',
        ]);
        yield exec.exec('git', [
            'config',
            '--global',
            'user.email',
            'github-actions[bot]@users.noreply.github.com',
        ]);
        // Add changes
        yield exec.exec('git', ['add', '.']);
        // Commit changes
        yield exec.exec('git', [
            'commit',
            '-m',
            `[ci]: Automated commit from Marketplace Release Action (triggered by @${GITHUB_ACTOR})`,
        ]);
        // Push changes
        yield exec.exec('git', ['push']);
    }
    catch (ex) {
        captureError(ex, 'Error committing changes');
    }
});
const captureError = (ex, detailedPrefix) => {
    const errMsg = ex instanceof Error ? ex.message : 'Unknown error';
    errors.push(detailedPrefix ? `${detailedPrefix}: ${errMsg}` : `Error: ${errMsg}`);
};
const run = (contentDir, indexFile) => __awaiter(void 0, void 0, void 0, function* () {
    // Get a list of each of the child folders under features
    const features = yield fs_1.promises.readdir(contentDir);
    // Create an object to store the index data as we iterate through each feature
    const info = {
        features: [],
    };
    // features.forEach(async folder => {
    for (const folder of features) {
        const featurePath = path.join(contentDir, folder);
        // Read the existing info.json file. We'll need to update this with the files
        const featureInfo = yield fs_1.promises.readFile(path.join(featurePath, 'info.json'), 'utf8');
        const parsed = JSON.parse(featureInfo);
        const files = yield getFolderStructure([featurePath]);
        info.features.push({
            id: parsed.id,
            name: folder,
            label: parsed.label,
            description: parsed.description,
            version: parsed.version,
            files: parseFilePaths(files).map(file => path.relative(featurePath, file)),
        });
        // Create the package.xml file
        const packageXml = yield createPackageXml(featurePath);
        core.info(`packageXml: ${packageXml}`);
        const packageXmlPath = path.join(featurePath, 'package.xml');
        yield fs_1.promises.writeFile(packageXmlPath, packageXml);
        // Ensure the dist folder exists
        const distPath = path.join(featurePath, 'dist');
        yield fs_1.promises.mkdir(distPath, { recursive: true });
        // Zip the contents of the feature folder (including package.xml) and save
        // it to the dist folder
        yield zipFolder(featurePath, path.join(featurePath, 'dist', `${folder}.zip`));
    }
    core.info('index.json: ' + JSON.stringify(info, null, 2));
    // Write the updated index.json file
    yield fs_1.promises.writeFile(indexFile, JSON.stringify(info, null, 2));
    // Commit the changes generated in the action to the repository
    yield commit();
});
(() => __awaiter(void 0, void 0, void 0, function* () {
    yield run(CONTENT_DIR, INDEX_FILE);
    if (errors.length) {
        core.setFailed(errors.join('\n'));
    }
}))();
