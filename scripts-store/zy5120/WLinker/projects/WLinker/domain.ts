// WLinker - 领域模型
// 基于五菱官方开放接口 openapi.baojun.net（junApi/sgmw）的车辆数据结构。

export type LockState = "locked" | "unlocked" | "unknown"
export type OpenState = "closed" | "open" | "unknown"
export type ChargingState = "charging" | "complete" | "stopped" | "disconnected" | "unknown"
export type Freshness = "fresh" | "stale" | "expired" | "missing" | "invalid"

// 车辆基础信息（carInfo）
export interface VehicleInfo {
  vin: string
  carName: string
  carNickname: string
  model: string
  carTypeName: string
  colorName: string
  purchaseDate?: number
  purchaseUserName?: string
  shopName?: string
  image: string
  carPlate: string
  seriesCode?: string
  // 来自 queryAllFavoriteCar（爱车信息）
  factoryCarName?: string
  dealerCode?: string
  authenticatedUserMobile?: string
  // 来自 carInfo
  carOwnerDay?: number
  bindCarUserMobile?: string
  level?: string
  vsn?: string
}

// 车辆实时状态（carStatus）
export interface VehicleStatus {
  // 里程 / 续航
  mileage?: number
  yesterMileage?: number
  leftMileage?: number
  // 电池
  batterySoc?: number
  batHealth?: number
  batAvgTemp?: number
  batMinTemp?: number
  batMaxTemp?: number
  voltage?: number
  lowBatVol?: number
  leftBatteryPower?: number
  // 燃油（混动车）
  leftFuel?: number
  // 门锁 / 门窗
  doorLockStatus?: number
  door1LockStatus?: number
  door2LockStatus?: number
  door3LockStatus?: number
  door4LockStatus?: number
  tailDoorLockStatus?: number
  doorOpenStatus?: number
  door1OpenStatus?: number
  door2OpenStatus?: number
  door3OpenStatus?: number
  door4OpenStatus?: number
  tailDoorOpenStatus?: number
  windowStatus?: number
  window1OpenStatus?: number
  window2OpenStatus?: number
  window3OpenStatus?: number
  window4OpenStatus?: number
  window1Status?: number
  window2Status?: number
  window3Status?: number
  window4Status?: number
  windowHalfOpenStatus?: number
  window1HalfOpenStatus?: number
  window2HalfOpenStatus?: number
  window3HalfOpenStatus?: number
  window4HalfOpenStatus?: number
  window1OpenDegree?: number
  window2OpenDegree?: number
  window3OpenDegree?: number
  window4OpenDegree?: number
  // 座椅
  seat1HotStatus?: number
  seat1WindStatus?: number
  seat2HotStatus?: number
  seat2WindStatus?: number
  seat3HotStatus?: number
  seat3WindStatus?: number
  seat4HotStatus?: number
  seat4WindStatus?: number
  // 车灯
  dipHeadLight?: number
  lowBeamLight?: number
  frontFogLight?: number
  rearFogLight?: number
  leftTurnLight?: number
  rightTurnLight?: number
  // 温度 / 电流
  invActTemp?: number
  tmActTemp?: number
  obcOtpCur?: number
  // 充电
  charging?: number
  rechargeStatus?: number
  wireConnect?: number
  vecChrgingSts?: number
  batteryStatus?: number
  batSOH?: number
  chargePower?: number
  obcTemp?: number
  current?: number
  oilLeftMileage?: number
  hybridMileage?: number
  // 行驶 / 驾驶
  vehSpdAvgDrvn?: number
  strWhAng?: number
  brakPedalPos?: number
  accActPos?: number
  sentinelModeStatus?: number
  intelligentCarSwitch?: number
  limitFeedback?: number
  interiorTemperature?: number
  cdjTemp?: number
  mileType?: number
  // 状态 / 位置
  status?: string
  statusName?: string
  statusToast?: string
  latitude?: number
  longitude?: number
  collectTime?: string
  acStatus?: number
  keyStatus?: number
  autoGearStatus?: number
  leftSlidingDoorStatus?: string
  rightSlidingDoorStatus?: string
}

// 车辆健康检查（car/check/all）
export interface VehicleCheck {
  batVol?: string
  batTemp?: string
  batScore?: string
  engineTemp?: string
  engineScore?: string
  pwrStrIo?: string
  absio?: string
  cCSts?: string
  charging?: string
  cduState?: string
  collectTime?: string
}

// 车辆快照（统一给 UI / 小组件使用）
export interface VehicleSnapshot {
  schemaVersion: 1
  localVehicleId: string
  vin: string
  info: VehicleInfo
  status: VehicleStatus
  check?: VehicleCheck
  fetchedAt: string
  cachedAt: string
  source: "network" | "fixture"
}

// 设置
export interface WulingSettings {
  schemaVersion: 1
  freshnessMinutes: number
  staleHours: number
  selectedVin: string
  noTiresLine1?: string
  noTiresLine2?: string
  // 车门数（宏光 MINIEV 等两门车为 2，四门车可改为 4）
  doorCount: 2 | 4
}

// 小组件参数（来自 Widget.parameter）
export interface WidgetParameter {
  theme?: "overview" | "energy" | "safety"
}
