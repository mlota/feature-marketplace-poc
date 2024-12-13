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
const github = __importStar(require("@actions/github"));
const archiver_1 = __importDefault(require("archiver"));
const fs = __importStar(require("fs"));
const fs_1 = require("fs");
const path = __importStar(require("path"));
const xml2js_1 = require("xml2js");
const marketplace_models_1 = require("./models/marketplace.models");
// Action inputs
const API_VERSION = core.getInput('api-version');
const GITHUB_TOKEN = core.getInput('github-token', { required: true });
const TAG_NAME = core.getInput('tag-name', { required: true });
const RELEASE_NAME = core.getInput('release-name', { required: true });
const RELEASE_VERSION = core.getInput('release-version', {
    required: true,
});
// Environment variables
const GITHUB_TRIGGERING_ACTOR = process.env.GITHUB_TRIGGERING_ACTOR;
const GITHUB_ACTOR = process.env.GITHUB_ACTOR;
const GITHUB_WORKSPACE = process.env.GITHUB_WORKSPACE;
const INDEX_FILE = path.join(GITHUB_WORKSPACE, 'index.json');
const CONTENT_DIR = path.join(GITHUB_WORKSPACE, 'content');
const IGNORED_DIRECTORY_CONTENT = [
    'dist',
    '.DS_Store',
    'package.xml',
    'destructiveChanges.xml',
    'info.json',
];
const errors = [];
const octokit = github.getOctokit(GITHUB_TOKEN);
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
            Package: Object.assign({ types: mappedTypes }, (version ? { version } : {})),
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
const createEmptyPackageXmlContent = (version) => {
    let xml = '';
    try {
        const builder = new xml2js_1.Builder();
        const packObj = {
            Package: { version },
        };
        xml = builder
            .buildObject(packObj)
            .replace('<Package>', '<Package xmlns="http://soap.sforce.com/2006/04/metadata">')
            .replace(' standalone="yes"', '');
    }
    catch (ex) {
        captureError(ex, 'Error creating empty package.xml');
    }
    return xml;
};
const createPackageXml = (featurePath_1, ...args_1) => __awaiter(void 0, [featurePath_1, ...args_1], void 0, function* (featurePath, destructive = false) {
    const folders = yield getSubdirectories(featurePath);
    const packageXmlPath = path.join(featurePath, 'package.xml');
    const destructiveChangesXmlPath = path.join(featurePath, 'destructiveChanges.xml');
    const types = {};
    for (const folder of folders) {
        const baseName = path.basename(folder);
        if (marketplace_models_1.metadataTypeFolderMappings[baseName]) {
            // Read files and folders (hence using 'entries' convention)
            const entries = yield fs_1.promises.readdir(folder, { withFileTypes: true });
            types[marketplace_models_1.metadataTypeFolderMappings[baseName]] = entries
                .filter(entry => !entry.name.endsWith('-meta.xml'))
                .map(entry => path.parse(entry.name).name);
        }
    }
    if (destructive) {
        const emptyPackageXml = createEmptyPackageXmlContent(API_VERSION);
        yield fs_1.promises.writeFile(packageXmlPath, emptyPackageXml);
        const destructiveChangesXml = createPackageXmlContent(types);
        yield fs_1.promises.writeFile(destructiveChangesXmlPath, destructiveChangesXml);
    }
    else {
        const packageXml = createPackageXmlContent(types, API_VERSION);
        yield fs_1.promises.writeFile(packageXmlPath, packageXml);
    }
});
const hasPendingChanges = () => __awaiter(void 0, void 0, void 0, function* () {
    let hasChanges = false;
    let output = '';
    const options = {
        listeners: {
            stdout: (data) => {
                output += data.toString();
            },
        },
    };
    try {
        yield exec.exec('git', ['status', '--porcelain'], options);
        hasChanges = output.trim().length > 0;
    }
    catch (ex) {
        captureError(ex, 'Error checking for pending changes');
    }
    return hasChanges;
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
const createInstallationZip = (featurePath) => __awaiter(void 0, void 0, void 0, function* () {
    const distPath = path.join(featurePath, 'dist');
    const basename = path.basename(featurePath);
    const packageXmlPath = path.join(featurePath, 'package.xml');
    const installZipPath = path.join(featurePath, 'dist', `${basename}-install.zip`);
    // Create the package.xml file
    yield createPackageXml(featurePath);
    // Ensure the dist folder exists
    yield fs_1.promises.mkdir(distPath, { recursive: true });
    // Zip the contents of the feature folder (including package.xml) and save
    // it to the dist folder
    yield zipFolder(featurePath, installZipPath);
    // Remove the temporary package.xml file
    yield deleteFile(packageXmlPath);
    return installZipPath;
});
const fileExists = (filePath) => __awaiter(void 0, void 0, void 0, function* () {
    return fs.promises
        .access(filePath, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);
});
const deleteFile = (filePath) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield exec.exec('rm', [filePath]);
        core.info(`File removed: ${filePath}`);
    }
    catch (error) {
        captureError(error, `Error removing file: ${filePath}`);
    }
});
const createUninstallZip = (featurePath) => __awaiter(void 0, void 0, void 0, function* () {
    const distPath = path.join(featurePath, 'dist');
    const basename = path.basename(featurePath);
    const destructiveChangesXmlPath = path.join(featurePath, 'destructiveChanges.xml');
    const packageXmlPath = path.join(featurePath, 'package.xml');
    const uninstallZipPath = path.join(featurePath, 'dist', `${basename}-uninstall.zip`);
    // Ensure the dist folder exists
    yield fs_1.promises.mkdir(distPath, { recursive: true });
    // Create the package.xml and destructiveChanges.xml files
    yield createPackageXml(featurePath, true);
    // Create a zip file containing just the package.xml and
    // destructiveChanges.xml files
    const output = fs.createWriteStream(path.join(distPath, `${basename}-uninstall.zip`));
    const archive = (0, archiver_1.default)('zip', {
        zlib: { level: 9 }, // Sets the compression level
    });
    const zipPromise$ = new Promise((resolve, reject) => {
        output.on('close', () => {
            console.log(`Archive created successfully, total bytes: ${archive.pointer()}`);
            resolve(uninstallZipPath);
        });
        archive.on('error', err => {
            reject(err);
        });
        archive.pipe(output);
        // Append the package.xml and destructiveChanges.xml files to the archive
        archive.file(path.join(featurePath, 'package.xml'), {
            name: 'package.xml',
        });
        archive.file(path.join(featurePath, 'destructiveChanges.xml'), {
            name: 'destructiveChanges.xml',
        });
        archive.finalize();
    });
    yield zipPromise$;
    // Remove the temporary xml files
    yield deleteFile(packageXmlPath);
    yield deleteFile(destructiveChangesXmlPath);
    return uninstallZipPath;
});
const createZipFileRequestUrl = (owner, repo, feature, uninstall = false) => {
    const zipFile = uninstall
        ? `${feature}-uninstall.zip`
        : `${feature}-install.zip`;
    return `https://api.github.com/repos/${owner}/${repo}/contents/content/${feature}/dist/${zipFile}`;
};
const run = (contentDir, indexFile) => __awaiter(void 0, void 0, void 0, function* () {
    // Get a list of each of the child folders under features
    const features = yield fs_1.promises.readdir(contentDir);
    // Create an object to store the index data as we iterate through each feature
    const info = {
        features: [],
    };
    // Get the owner and repo from the context
    const { owner, repo } = github.context.repo;
    // Optionally keeping track of created zip files for later use
    const installZipPaths = [];
    const uninstallZipPaths = [];
    for (const folder of features) {
        const featurePath = path.join(contentDir, folder);
        // Read the existing info.json file from the feature folder. We'll need
        // this to build the info.json
        const featureInfo = yield fs_1.promises.readFile(path.join(featurePath, 'info.json'), 'utf8');
        const parsed = JSON.parse(featureInfo);
        const files = yield getFolderStructure([featurePath]);
        const installZipPath = yield createInstallationZip(featurePath);
        const uninstallZipPath = yield createUninstallZip(featurePath);
        installZipPaths.push(installZipPath);
        uninstallZipPaths.push(uninstallZipPath);
        info.features.push({
            id: parsed.id,
            name: folder,
            label: parsed.label,
            description: parsed.description,
            version: parsed.version,
            files: parseFilePaths(files).map(file => path.relative(featurePath, file)),
            installZipFilePath: createZipFileRequestUrl(owner, repo, folder),
            uninstallZipFilePath: createZipFileRequestUrl(owner, repo, folder, true),
        });
    }
    core.info('index.json: ' + JSON.stringify(info, null, 2));
    const response = yield octokit.rest.repos.createRelease(Object.assign(Object.assign({}, github.context.repo), { tag_name: RELEASE_VERSION, name: RELEASE_VERSION, body: `Automated release for version ${RELEASE_VERSION}` }));
    const releaseId = response.data.id;
    const releaseUrl = response.data.html_url;
    core.info(`Release created: ${releaseUrl}`);
    core.info(`Release ID: ${releaseId}`);
    for (const installZipPath of installZipPaths) {
        const absolutePath = path.resolve(installZipPath);
        const fileName = path.basename(absolutePath);
        const fileData = yield fs_1.promises.readFile(absolutePath, 'utf8');
        console.log(`Attaching file: ${fileName}`);
        yield octokit.rest.repos.uploadReleaseAsset({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            release_id: releaseId,
            name: fileName,
            data: fileData,
        });
    }
    // Write the updated index.json file
    yield fs_1.promises.writeFile(indexFile, JSON.stringify(info, null, 2));
    const hasChanges = yield hasPendingChanges();
    if (hasChanges) {
        // Commit the changes generated in the action to the repository
        yield commit();
    }
    else {
        core.info('No changes to commit');
    }
});
(() => __awaiter(void 0, void 0, void 0, function* () {
    yield run(CONTENT_DIR, INDEX_FILE);
    if (errors.length) {
        core.setFailed(errors.join('\n'));
    }
}))();
