<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { RedisConnectionConfig } from '../../../shared/types'
import { createId } from '../utils/tree'
import { toConnection } from '../utils/plain'

const props = defineProps<{
  visible: boolean
  editing?: RedisConnectionConfig | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'saved', config: RedisConnectionConfig): void
}>()

const form = reactive<RedisConnectionConfig>({
  id: '',
  name: '',
  host: '127.0.0.1',
  port: 6379,
  username: '',
  password: '',
  db: 0,
  delimiter: ':',
  tls: false
})

const busy = reactive({ test: false, save: false })

watch(
  () => props.visible,
  (open) => {
    if (!open) return
    if (props.editing) {
      Object.assign(form, props.editing)
    } else {
      Object.assign(form, {
        id: createId(),
        name: '',
        host: '127.0.0.1',
        port: 6379,
        username: '',
        password: '',
        db: 0,
        delimiter: ':',
        tls: false
      })
    }
  }
)

const title = computed(() => (props.editing ? '编辑 Redis 连接' : '新建 Redis 连接'))

function close() {
  emit('update:visible', false)
}

async function test() {
  busy.test = true
  try {
    const result = await window.redisAPI.testConnection(toConnection(form))
    if (result.ok) ElMessage.success(`连接成功：${result.message}`)
    else ElMessage.error(result.message)
  } finally {
    busy.test = false
  }
}

async function save() {
  if (!form.name.trim() || !form.host.trim()) {
    ElMessage.warning('请填写连接名称和主机地址')
    return
  }
  busy.save = true
  try {
    emit('saved', {
      ...form,
      name: form.name.trim(),
      host: form.host.trim(),
      port: Number(form.port) || 6379,
      db: Number(form.db) || 0,
      delimiter: form.delimiter || ':'
    })
    close()
  } finally {
    busy.save = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="520px"
    append-to-body
    destroy-on-close
    @close="close"
  >
    <el-form label-width="92px">
      <el-form-item label="连接名称">
        <el-input v-model="form.name" placeholder="例如 本地开发 / 生产缓存" />
      </el-form-item>
      <el-form-item label="Host">
        <el-input v-model="form.host" placeholder="127.0.0.1" />
      </el-form-item>
      <el-form-item label="Port">
        <el-input-number v-model="form.port" :min="1" :max="65535" controls-position="right" />
      </el-form-item>
      <el-form-item label="Username">
        <el-input v-model="form.username" placeholder="Redis 6+ ACL，可空" />
      </el-form-item>
      <el-form-item label="Password">
        <el-input v-model="form.password" type="password" show-password placeholder="可空" />
      </el-form-item>
      <el-form-item label="DB">
        <el-input-number v-model="form.db" :min="0" :max="255" controls-position="right" />
      </el-form-item>
      <el-form-item label="层级分隔符">
        <el-input v-model="form.delimiter" placeholder="默认 :" />
      </el-form-item>
      <el-form-item label="TLS">
        <el-switch v-model="form.tls" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :loading="busy.test" @click="test">测试连接</el-button>
      <el-button type="primary" :loading="busy.save" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>
