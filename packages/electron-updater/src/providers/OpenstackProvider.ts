import { OpenstackOptions, HttpError, newError, UpdateInfo, DownloadOptions } from "builder-util-runtime"
import { AppUpdater } from "../AppUpdater"
import { getChannelFilename, newBaseUrl, newUrlFromBase, Provider, ResolvedUpdateFileInfo } from "../main"
import { parseUpdateInfo, ProviderRuntimeOptions, resolveFiles } from "./Provider"
import { storage } from 'pkgcloud';
import fs from "fs"

type Client = storage.Client;
type File = storage.File;

export class OpenstackProvider extends Provider<UpdateInfo> {
  private readonly baseUrl = newBaseUrl(this.configuration.authUrl)

  constructor(private readonly configuration: OpenstackOptions, private readonly updater: AppUpdater, runtimeOptions: ProviderRuntimeOptions) {
    super(runtimeOptions)
  }

  private get client(): Client {
    return storage.createClient({
      authUrl: this.baseUrl.href,
      domainId: 'default',
      domainName: this.configuration.tenantName,
      keystoneAuthVersion: this.configuration.apiVersion,
      password: process.env.UPDATE_USER_PASSWORD,
      provider: 'openstack',
      region: this.configuration.region,
      tenantId: this.configuration.tenantId,
      username: process.env.UPDATE_USER_NAME,
    });
  }

  private get channel(): string {
    const result = this.updater.channel || this.configuration.channel
    return result == null ? this.getDefaultChannelName() : this.getCustomChannelName(result)
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    const channelFile = getChannelFilename(this.channel)
    const channelUrl = newUrlFromBase(channelFile, this.baseUrl, this.updater.isAddNoCacheQuery)
    for (let attemptNumber = 0; ; attemptNumber++) {
      try {
        return parseUpdateInfo(await this.request(channelUrl), channelFile, channelUrl)
      }
      catch (e) {
        if (e instanceof HttpError && e.statusCode === 404) {
          throw newError(`Cannot find channel "${channelFile}" update info: ${e.stack || e.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND")
        }
        else if (e.code === "ECONNREFUSED") {
          if (attemptNumber < 3) {
            await new Promise((resolve, reject) => {
              try {
                setTimeout(resolve, 1000 * attemptNumber)
              }
              catch (e) {
                reject(e)
              }
            })
            continue
          }
        }
        throw e
      }
    }
  }

  private async request(channelUrl: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const stream: NodeJS.ReadStream = this.client.download({
        container: this.configuration.container,
        remote: channelUrl,
      })

      let result: any = [];
      stream.on('error', (err: any) => {
        reject(err)
      })

      stream.on('data', (data: any) => {
        result.push(data);
      })

      stream.on('end', () => {
        resolve(result)
      })
    })
  }

  resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo> {
    return resolveFiles(updateInfo, this.baseUrl)
  }

  async download(url: URL, destination: string, _: DownloadOptions): Promise<string> {
    const data = this.request(url.href)
    fs.writeFileSync(destination, data)
    return data;
  }
}