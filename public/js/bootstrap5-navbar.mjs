// import _ from 'lodash'
// import { onMounted, ref, watch } from 'vue'

export default {
  template: '#template-bootstrap5-navbar',
  props: ['baseurl'],
  setup (props) {
    // const { blogsearch } = window
    // const searchPosts = ref([])
    // const searchText = ref('')
    // let engine = null

    // onMounted(async () => {
    //   engine = await blogsearch.engine({ dbPath: `${props.baseurl}/blogsearch.db.wasm` })
    // })

    // const blogsearchArgs = [5, '<span class="text-decoration-underline link-offset-2">', '</span>', 15]
    // watch(searchText, async (newVal, oldVal) => {
    //   try {
    //     newVal = _.trim(newVal)
    //     if (newVal === '') searchPosts.value = []
    //     else searchPosts.value = await engine.search(newVal, ...blogsearchArgs)
    //   } catch (err) {
    //     console.error(err)
    //     searchPosts.value = []
    //   }
    // })

    return { baseurl: props.baseurl } // searchText, searchPosts
  },
}
